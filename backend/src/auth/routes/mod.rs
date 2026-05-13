pub mod callback;
pub mod login;
pub mod logout;
pub mod me;
pub mod repos;

pub use callback::callback;
pub use login::login;
pub use logout::logout;
pub use me::me;
pub use repos::repos;

#[derive(serde::Deserialize)]
pub struct CallbackParams {
    pub code: String,
}
