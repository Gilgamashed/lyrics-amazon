mod now_playing;
mod source;

use std::io;
use std::sync::{Arc, RwLock};

use axum::{
    Json, Router,
    body::Body,
    extract::{
        State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::{HeaderValue, Method, Request, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
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

/// Binds the bridge to 127.0.0.1:PORT (localhost only).
pub async fn bind_bridge() -> io::Result<tokio::net::TcpListener> {
    tokio::net::TcpListener::bind(std::net::SocketAddr::from(([127, 0, 0, 1], PORT))).await
}

pub async fn run() {
    let (state, _) = BridgeState::new();

    source::spawn_poller(Arc::clone(&state));

    let router = build_router(Arc::clone(&state));

    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], PORT));
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
                HeaderValue::from_static("GET, HEAD, OPTIONS"),
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
    #[allow(clippy::await_holding_lock)] // serializes the two tests that bind the fixed PORT
    async fn bind_bridge_resolves_to_localhost_fixed_port() {
        let _guard = PORT_LOCK.lock().unwrap();
        // The fixed PORT can transiently be held by a neighbouring CI process or an
        // OS socket in transition, so tolerate AddrInUse briefly before asserting.
        for _ in 0..20 {
            match bind_bridge().await {
                Ok(bound) => {
                    let addr = bound.local_addr().unwrap();
                    assert!(addr.ip().is_loopback());
                    assert_eq!(addr.port(), PORT);
                    return;
                }
                Err(error) if error.kind() != std::io::ErrorKind::AddrInUse => {
                    panic!("unexpected bind error: {error}");
                }
                Err(_) => tokio::time::sleep(Duration::from_millis(150)).await,
            }
        }
        panic!("fixed bridge port {PORT} stayed busy across retries");
    }

    #[tokio::test]
    #[allow(clippy::await_holding_lock)] // serializes the two tests that bind the fixed PORT
    async fn bind_bridge_fails_when_port_is_in_use() {
        let _guard = PORT_LOCK.lock().unwrap();
        let blocker = TcpListener::bind(std::net::SocketAddr::from(([127, 0, 0, 1], PORT)))
            .await
            .unwrap();
        assert!(bind_bridge().await.is_err());
        drop(blocker);
    }
}
