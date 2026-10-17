mod capture;
mod now_playing;
mod source;

use std::io;
use std::sync::{Arc, OnceLock, RwLock};

use axum::{
    Json, Router,
    body::{Body, Bytes},
    extract::{
        Query, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::{HeaderValue, Method, Request, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use tokio::sync::broadcast;

pub use now_playing::NowPlaying;

pub const PORT: u16 = 48765;

pub struct BridgeState {
    current: RwLock<NowPlaying>,
    updates: broadcast::Sender<NowPlaying>,
}

impl BridgeState {
    pub fn new() -> (Arc<Self>, broadcast::Receiver<NowPlaying>) {
        let (updates, receiver) = broadcast::channel(64);
        let state = Arc::new(Self {
            current: RwLock::new(NowPlaying::idle(source::SOURCE_ID)),
            updates,
        });
        (state, receiver)
    }

    /// Records a new now-playing value and notifies WebSocket subscribers.
    /// Idempotent publishers usually compare first, but an unconditional update
    /// is also correct (callers may resend the same value for `hold` style mock
    /// sources).
    pub(crate) fn update(&self, now_playing: NowPlaying) {
        {
            let mut current = self.current.write().unwrap();
            *current = now_playing.clone();
        }
        let _ = self.updates.send(now_playing);
    }
}

/// Builds the axum router with the localhost-only CORS middleware applied.
pub fn build_router(state: Arc<BridgeState>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/now-playing", get(now_playing))
        .route("/fetch", get(fetch_proxy))
        .route("/capture", post(capture_audio))
        .route("/ws", get(ws_upgrade))
        .layer(middleware::from_fn(cors_layer))
        .with_state(state)
}

/// Serves the router on an already-bound listener, logging fatal errors.
pub async fn serve(listener: tokio::net::TcpListener, router: Router) {
    if let Err(error) = axum::serve(listener, router).await {
        log::error!("[bridge] server stopped: {error}");
    }
}

/// The bridge bind address: localhost only, fixed port.
pub fn localhost_bind_addr() -> std::net::SocketAddr {
    std::net::SocketAddr::from(([127, 0, 0, 1], PORT))
}

/// Binds the bridge to localhost_bind_addr (localhost only).
pub async fn bind_bridge() -> io::Result<tokio::net::TcpListener> {
    bind_bridge_at(localhost_bind_addr()).await
}

async fn bind_bridge_at(addr: std::net::SocketAddr) -> io::Result<tokio::net::TcpListener> {
    tokio::net::TcpListener::bind(addr).await
}

pub async fn run() {
    let (state, _) = BridgeState::new();

    source::spawn_poller(Arc::clone(&state));

    let router = build_router(Arc::clone(&state));

    let addr = localhost_bind_addr();
    match bind_bridge().await {
        Ok(listener) => {
            log::info!("[bridge] listening on http://{addr}");
            serve(listener, router).await;
        }
        Err(error) => log::error!("[bridge] failed to bind {addr}: {error}"),
    }
}

/// Allows browser origins running on localhost (any port) plus the Tauri
/// webview origins (`tauri://localhost`, `http://tauri.localhost`) to read
/// bridge responses. Non-local origins and requests without an `Origin` are
/// unchanged, so Node clients and CLI tools behave exactly as before.
async fn cors_layer(request: Request<Body>, next: Next) -> Response {
    let origin = request
        .headers()
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
        .filter(|value| is_local_origin(value))
        .map(ToOwned::to_owned);

    if request.method() == Method::OPTIONS {
        let mut response = Response::new(Body::empty());
        *response.status_mut() = StatusCode::NO_CONTENT;
        if let Some(origin) = origin.as_deref() {
            let headers = response.headers_mut();
            headers.insert(
                header::ACCESS_CONTROL_ALLOW_ORIGIN,
                HeaderValue::from_str(origin).unwrap(),
            );
            headers.insert(
                header::ACCESS_CONTROL_ALLOW_METHODS,
                HeaderValue::from_static("GET, HEAD, POST, OPTIONS"),
            );
            headers.insert(header::VARY, HeaderValue::from_static("Origin"));
        }
        return response;
    }

    let mut response = next.run(request).await;
    if let Some(origin) = origin {
        let headers = response.headers_mut();
        headers.insert(
            header::ACCESS_CONTROL_ALLOW_ORIGIN,
            HeaderValue::from_str(&origin).unwrap(),
        );
        headers.insert(header::VARY, HeaderValue::from_static("Origin"));
    }
    response
}

fn is_local_origin(origin: &str) -> bool {
    let Some((scheme, rest)) = origin.split_once("://") else {
        return false;
    };
    let host = rest.split('/').next().unwrap_or(rest);
    let host = host.split(':').next().unwrap_or(host);
    match scheme {
        "tauri" => host == "localhost",
        "http" | "https" => {
            host == "localhost" || host.ends_with(".localhost") || host == "127.0.0.1"
        }
        _ => false,
    }
}

async fn health() -> &'static str {
    "ok"
}

async fn now_playing(State(state): State<Arc<BridgeState>>) -> Json<NowPlaying> {
    Json(state.current.read().unwrap().clone())
}

/// A desktop browser User-Agent; some lyrics hosts reject the default reqwest UA.
const BROWSER_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
     (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(BROWSER_UA)
            .build()
            .expect("failed to build the bridge HTTP client")
    })
}

/// Restricts the proxy to the lyrics sources we actually consume (plus loopback,
/// which keeps the endpoint testable). Everything else is refused as SSRF guard.
fn is_allowed_host(host: &str) -> bool {
    let host = host.to_ascii_lowercase();
    host == "genius.com"
        || host.ends_with(".genius.com")
        || host == "lrclib.net"
        || host.ends_with(".lrclib.net")
        || host == "test-0k.onrender.com"
        || host == "127.0.0.1"
        || host == "localhost"
}

#[derive(serde::Deserialize)]
struct FetchParams {
    url: String,
}

/// Server-side GET proxy that lets the webview/browser read cross-origin lyrics
/// sources whose responses lack permissive CORS headers. The caller's localhost
/// or Tauri origin is reflected by `cors_layer`, so the response is readable.
async fn fetch_proxy(Query(params): Query<FetchParams>) -> Response {
    let target = match reqwest::Url::parse(&params.url) {
        Ok(url) => url,
        Err(_) => return (StatusCode::BAD_REQUEST, "invalid url").into_response(),
    };
    if !matches!(target.scheme(), "http" | "https") {
        return (StatusCode::BAD_REQUEST, "unsupported scheme").into_response();
    }
    match target.host_str() {
        Some(host) if is_allowed_host(host) => {}
        _ => return (StatusCode::FORBIDDEN, "host not allowed").into_response(),
    }

    match http_client().get(target).send().await {
        Ok(upstream) => {
            let status = upstream.status();
            let content_type = upstream
                .headers()
                .get(header::CONTENT_TYPE)
                .and_then(|value| value.to_str().ok())
                .map(ToOwned::to_owned);
            match upstream.bytes().await {
                Ok(bytes) => build_proxy_response(status, content_type, bytes),
                Err(error) => {
                    log::warn!("[bridge] fetch body error: {error}");
                    StatusCode::BAD_GATEWAY.into_response()
                }
            }
        }
        Err(error) => {
            log::warn!("[bridge] fetch failed: {error}");
            StatusCode::BAD_GATEWAY.into_response()
        }
    }
}

fn build_proxy_response(
    status: reqwest::StatusCode,
    content_type: Option<String>,
    bytes: Bytes,
) -> Response {
    let mut builder = Response::builder().status(status);
    if let Some(content_type) = content_type {
        builder = builder.header(header::CONTENT_TYPE, content_type);
    }
    builder
        .body(Body::from(bytes))
        .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
}

#[derive(serde::Deserialize, Default)]
struct CaptureParams {
    duration_ms: Option<i64>,
}

/// Records the default render endpoint (WASAPI loopback) and returns a PCM WAV.
/// Blocking device I/O runs on a worker thread so the async runtime is never
/// held up. Non-Windows hosts report 501; capture failures report 500.
async fn capture_audio(Query(params): Query<CaptureParams>) -> Response {
    let duration_ms = capture::clamp_duration_ms(params.duration_ms.unwrap_or(15_000));

    let result = tokio::task::spawn_blocking(move || capture::capture_loopback(duration_ms)).await;

    match result {
        Ok(Ok(bytes)) => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, HeaderValue::from_static("audio/wav"))],
            bytes,
        )
            .into_response(),
        Ok(Err(message)) => {
            log::warn!("[bridge] capture unavailable: {message}");
            (
                StatusCode::NOT_IMPLEMENTED,
                Json(serde_json::json!({ "error": message })),
            )
                .into_response()
        }
        Err(error) => {
            log::error!("[bridge] capture task failed: {error}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "capture task failed" })),
            )
                .into_response()
        }
    }
}

async fn ws_upgrade(
    ws: WebSocketUpgrade,
    State(state): State<Arc<BridgeState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| ws_session(socket, state))
}

async fn ws_session(mut socket: WebSocket, state: Arc<BridgeState>) {
    let mut updates = state.updates.subscribe();

    let snapshot = state.current.read().unwrap().clone();
    if let Ok(payload) = serde_json::to_string(&snapshot)
        && socket.send(Message::Text(payload.into())).await.is_err()
    {
        return;
    }

    loop {
        tokio::select! {
            update = updates.recv() => match update {
                Ok(now_playing) => {
                    let Ok(payload) = serde_json::to_string(&now_playing) else {
                        continue;
                    };
                    if socket.send(Message::Text(payload.into())).await.is_err() {
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            },
            incoming = socket.recv() => match incoming {
                Some(Ok(Message::Close(_))) | None => break,
                Some(Ok(_)) => {}
                Some(Err(_)) => break,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;
    use std::time::Duration;

    use axum::body::Body;
    use axum::http::{Method, Request, header};
    use futures_util::{SinkExt, StreamExt};
    use http_body_util::BodyExt;
    use tokio::net::TcpListener;
    use tokio::task::JoinHandle;
    use tower::ServiceExt;

    use super::*;

    // Serializes tests that bind the fixed bridge PORT (48765).
    static PORT_LOCK: Mutex<()> = Mutex::new(());

    fn np(title: &str, playing: bool) -> NowPlaying {
        NowPlaying {
            source: "windows-smtc".to_string(),
            title: Some(title.to_string()),
            artist: Some("Artist".to_string()),
            album: None,
            duration_ms: Some(180_000),
            position_ms: Some(30_000),
            is_playing: playing,
            app_id: Some("AmazonMusic.exe".to_string()),
            is_amazon: true,
            album_art: None,
        }
    }

    fn idle_state() -> Arc<BridgeState> {
        BridgeState::new().0
    }

    async fn get(router: &Router, uri: &str, origin: Option<&str>) -> Response {
        let mut builder = Request::builder().uri(uri);
        if let Some(origin) = origin {
            builder = builder.header(header::ORIGIN, origin);
        }
        router
            .clone()
            .oneshot(builder.body(Body::empty()).unwrap())
            .await
            .unwrap()
    }

    async fn body_text(response: Response) -> String {
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        String::from_utf8_lossy(&bytes).to_string()
    }

    async fn spawn_test_server() -> (std::net::SocketAddr, Arc<BridgeState>, JoinHandle<()>) {
        let state = idle_state();
        let router = build_router(Arc::clone(&state));
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let handle = tokio::spawn(async move { serve(listener, router).await });
        (addr, state, handle)
    }

    struct StaticSource(NowPlaying);

    impl source::NowPlayingSource for StaticSource {
        fn current(&self) -> Option<NowPlaying> {
            Some(self.0.clone())
        }
    }

    #[tokio::test]
    async fn health_returns_ok() {
        let router = build_router(idle_state());
        let response = get(&router, "/health", None).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(body_text(response).await, "ok");
    }

    #[tokio::test]
    async fn now_playing_returns_idle_snapshot_as_json() {
        let router = build_router(idle_state());
        let response = get(&router, "/now-playing", None).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers()[header::CONTENT_TYPE].to_str().unwrap(),
            "application/json"
        );
        let np: NowPlaying = serde_json::from_str(&body_text(response).await).unwrap();
        assert_eq!(np, NowPlaying::idle(source::SOURCE_ID));
    }

    #[tokio::test]
    async fn now_playing_returns_populated_snapshot() {
        let state = idle_state();
        let playing = np("Espresso", true);
        state.update(playing.clone());

        let router = build_router(Arc::clone(&state));
        let response = get(&router, "/now-playing", None).await;
        let body: NowPlaying = serde_json::from_str(&body_text(response).await).unwrap();
        assert_eq!(body, playing);
        assert_eq!(body.title.as_deref(), Some("Espresso"));
        assert!(body.is_playing);
    }

    #[tokio::test]
    async fn cors_reflects_allowed_localhost_origins() {
        let router = build_router(idle_state());
        for origin in [
            "http://localhost:3000",
            "http://localhost",
            "http://127.0.0.1:4173",
            "https://localhost:5173",
            "tauri://localhost",
            "http://tauri.localhost",
        ] {
            let response = get(&router, "/now-playing", Some(origin)).await;
            assert_eq!(
                response
                    .headers()
                    .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
                    .and_then(|value| value.to_str().ok()),
                Some(origin),
                "expected CORS reflection for {origin}"
            );
            assert!(
                response.headers().contains_key(header::VARY),
                "expected Vary header for {origin}"
            );
        }
    }

    #[tokio::test]
    async fn cors_is_not_added_for_foreign_or_missing_origins() {
        let router = build_router(idle_state());

        let response = get(&router, "/now-playing", None).await;
        assert!(
            !response
                .headers()
                .contains_key(header::ACCESS_CONTROL_ALLOW_ORIGIN)
        );

        for origin in ["https://evil.example", "https://pen-tester.evil.com"] {
            let response = get(&router, "/now-playing", Some(origin)).await;
            assert!(
                !response
                    .headers()
                    .contains_key(header::ACCESS_CONTROL_ALLOW_ORIGIN),
                "origin {origin} must not be reflected"
            );
        }
    }

    #[tokio::test]
    async fn cors_answers_options_preflight_for_localhost() {
        let router = build_router(idle_state());
        let response = router
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::OPTIONS)
                    .uri("/now-playing")
                    .header(header::ORIGIN, "http://localhost:3000")
                    .header(header::ACCESS_CONTROL_REQUEST_METHOD, "GET")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        assert_eq!(
            response
                .headers()
                .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
                .and_then(|value| value.to_str().ok()),
            Some("http://localhost:3000")
        );
        assert!(
            response
                .headers()
                .contains_key(header::ACCESS_CONTROL_ALLOW_METHODS)
        );
    }

    #[tokio::test]
    async fn ws_snapshot_on_connect_then_push_on_change() {
        let (addr, state, handle) = spawn_test_server().await;
        let url = format!("ws://{addr}/ws");
        let (mut socket, _) = tokio_tungstenite::connect_async(&url).await.unwrap();

        let first = socket.next().await.unwrap().unwrap();
        let snapshot: NowPlaying = serde_json::from_str(first.to_text().unwrap()).unwrap();
        assert_eq!(snapshot, NowPlaying::idle(source::SOURCE_ID));

        let playing = np("Espresso", true);
        state.update(playing.clone());

        let mut saw_push = false;
        for _ in 0..10 {
            let frame = socket.next().await.unwrap().unwrap();
            let pushed: NowPlaying = serde_json::from_str(frame.to_text().unwrap()).unwrap();
            if pushed == playing {
                saw_push = true;
                break;
            }
        }
        assert!(saw_push, "expected the playing frame to be pushed");

        let _ = socket.close(None).await;
        handle.abort();
    }

    #[tokio::test]
    async fn ws_does_not_duplicate_frames_when_unchanged() {
        let (addr, state, handle) = spawn_test_server().await;
        let url = format!("ws://{addr}/ws");
        let (mut socket, _) = tokio_tungstenite::connect_async(&url).await.unwrap();

        let _first = socket.next().await.unwrap().unwrap();

        state.update(np("Espresso", true));
        let mut saw_payload = None;
        for _ in 0..10 {
            let frame = socket.next().await.unwrap().unwrap();
            let pushed: NowPlaying = serde_json::from_str(frame.to_text().unwrap()).unwrap();
            if pushed.title.as_deref() == Some("Espresso") {
                saw_payload = Some(pushed);
                break;
            }
        }
        assert!(saw_payload.is_some());

        // An unchanged poll publishes nothing, so the client sees no new frame.
        let mut unchanged = StaticSource(saw_payload.unwrap());
        assert!(!source::poll_once(&mut unchanged, &state));
        let timed = tokio::time::timeout(Duration::from_millis(250), socket.next()).await;
        assert!(
            timed.is_err(),
            "unchanged value must not produce a duplicate frame"
        );

        let _ = socket.close(None).await;
        handle.abort();
    }

    #[tokio::test]
    async fn ws_survives_malformed_client_frames() {
        let (addr, _state, handle) = spawn_test_server().await;
        let url = format!("ws://{addr}/ws");
        let (mut socket, _) = tokio_tungstenite::connect_async(&url).await.unwrap();

        let _first = socket.next().await.unwrap().unwrap();
        socket
            .send(tokio_tungstenite::tungstenite::Message::text("not json"))
            .await
            .unwrap();
        socket
            .send(tokio_tungstenite::tungstenite::Message::Binary(vec![
                1, 2, 3,
            ]))
            .await
            .unwrap();
        let _ = socket.close(None).await;

        tokio::time::sleep(Duration::from_millis(100)).await;

        let (mut fresh, _) = tokio_tungstenite::connect_async(&url).await.unwrap();
        let snapshot = fresh.next().await.unwrap().unwrap();
        assert_eq!(
            snapshot.to_text().unwrap(),
            serde_json::to_string(&NowPlaying::idle(source::SOURCE_ID)).unwrap()
        );

        let _ = fresh.close(None).await;
        handle.abort();
    }

    #[tokio::test]
    #[allow(clippy::await_holding_lock)] // serializes the fixed-PORT live bind below
    async fn bind_bridge_resolves_to_localhost_fixed_port() {
        let _guard = PORT_LOCK.lock().unwrap();

        let addr = localhost_bind_addr();
        assert!(addr.ip().is_loopback());
        assert_eq!(addr.port(), PORT);

        match bind_bridge().await {
            Ok(bound) => assert_eq!(bound.local_addr().unwrap(), addr),
            Err(error) if error.kind() == std::io::ErrorKind::AddrInUse => {
                // A runner host can transiently hold the fixed PORT, which is outside
                // our control; the bind-at-addr semantics are proven by the in-use test
                // below and the packaged-app/e2e suites exercise the real fixed PORT.
            }
            Err(error) => panic!("unexpected fixed-port bind error: {error}"),
        }
    }

    #[tokio::test]
    #[allow(clippy::await_holding_lock)] // serializes with the fixed-PORT live bind above
    async fn bind_bridge_fails_when_port_is_in_use() {
        let _guard = PORT_LOCK.lock().unwrap();
        // Prove the in-use semantics on an OS-allocated loopback port rather than the
        // fixed PORT, whose availability on shared CI hosts we do not control.
        let blocker = TcpListener::bind("127.0.0.1:0").await.unwrap();
        assert!(bind_bridge_at(blocker.local_addr().unwrap()).await.is_err());
        drop(blocker);
    }

    fn percent_encode(value: &str) -> String {
        value
            .chars()
            .map(|c| match c {
                'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
                _ => format!("%{:02X}", c as u32),
            })
            .collect()
    }

    #[test]
    fn is_allowed_host_accepts_lyrics_sources_and_loopback_only() {
        for host in [
            "genius.com",
            "api.genius.com",
            "lrclib.net",
            "www.lrclib.net",
            "test-0k.onrender.com",
            "127.0.0.1",
            "localhost",
        ] {
            assert!(is_allowed_host(host), "expected {host} to be allowed");
        }
        for host in [
            "evil.example",
            "genius.com.evil.example",
            "notgenius.com",
            "example.org",
            "onrender.com",
            "evil.onrender.com",
        ] {
            assert!(!is_allowed_host(host), "expected {host} to be rejected");
        }
    }

    #[tokio::test]
    async fn fetch_rejects_invalid_url_scheme_and_disallowed_host() {
        let router = build_router(idle_state());

        let invalid = get(&router, "/fetch?url=not-a-url", None).await;
        assert_eq!(invalid.status(), StatusCode::BAD_REQUEST);

        let bad_scheme = get(&router, "/fetch?url=file%3A%2F%2F%2Fetc%2Fpasswd", None).await;
        assert_eq!(bad_scheme.status(), StatusCode::BAD_REQUEST);

        let foreign = get(&router, "/fetch?url=https%3A%2F%2Fevil.example%2F", None).await;
        assert_eq!(foreign.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn fetch_proxies_allowed_upstream_body_and_content_type() {
        // A local upstream that deliberately sends no CORS headers.
        let upstream =
            Router::new().route("/lyrics", axum::routing::get(|| async { "hello lyrics" }));
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let handle = tokio::spawn(async move { serve(listener, upstream).await });

        let router = build_router(idle_state());
        let uri = format!(
            "/fetch?url={}",
            percent_encode(&format!("http://{addr}/lyrics"))
        );
        let response = get(&router, &uri, Some("http://localhost:4173")).await;

        assert_eq!(response.status(), StatusCode::OK);
        let content_type = response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
            .to_string();
        assert!(content_type.starts_with("text/plain"), "got {content_type}");
        assert_eq!(body_text(response).await, "hello lyrics");

        handle.abort();
    }

    #[tokio::test]
    async fn capture_route_is_wired_for_post() {
        let router = build_router(idle_state());
        let response = router
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/capture?duration_ms=1")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        // The route exists (no 404/405). On Windows the device path is unavailable
        // in CI hygiene but must still resolve to a defined status, never a panic.
        assert_ne!(response.status(), StatusCode::NOT_FOUND);
        assert_ne!(response.status(), StatusCode::METHOD_NOT_ALLOWED);
        assert!(
            matches!(
                response.status(),
                StatusCode::OK | StatusCode::NOT_IMPLEMENTED | StatusCode::INTERNAL_SERVER_ERROR
            ),
            "unexpected capture status: {}",
            response.status()
        );
    }

    #[tokio::test]
    async fn cors_preflight_advertises_post_for_capture() {
        let router = build_router(idle_state());
        let response = router
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::OPTIONS)
                    .uri("/capture")
                    .header(header::ORIGIN, "http://localhost:3000")
                    .header(header::ACCESS_CONTROL_REQUEST_METHOD, "POST")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        let methods = response
            .headers()
            .get(header::ACCESS_CONTROL_ALLOW_METHODS)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default();
        assert!(methods.contains("POST"), "got {methods}");
    }
}
