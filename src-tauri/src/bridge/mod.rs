mod now_playing;
mod source;

use std::sync::{Arc, RwLock};

use axum::{
    Json, Router,
    extract::{
        State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::IntoResponse,
    routing::get,
};
use tokio::sync::broadcast;

pub use now_playing::NowPlaying;

pub const PORT: u16 = 48765;

pub struct BridgeState {
    current: RwLock<NowPlaying>,
    updates: broadcast::Sender<NowPlaying>,
}

pub async fn run() {
    let (updates, _) = broadcast::channel(64);
    let state = Arc::new(BridgeState {
        current: RwLock::new(NowPlaying::idle(source::SOURCE_ID)),
        updates,
    });

    source::spawn_poller(Arc::clone(&state));

    let router = Router::new()
        .route("/health", get(health))
        .route("/now-playing", get(now_playing))
        .route("/ws", get(ws_upgrade))
        .with_state(Arc::clone(&state));

    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], PORT));
    match tokio::net::TcpListener::bind(addr).await {
        Ok(listener) => {
            log::info!("[bridge] listening on http://{addr}");
            if let Err(error) = axum::serve(listener, router).await {
                log::error!("[bridge] server stopped: {error}");
            }
        }
        Err(error) => log::error!("[bridge] failed to bind {addr}: {error}"),
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
