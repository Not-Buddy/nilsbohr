pub mod callback;
pub mod google_callback;
pub mod google_login;
pub mod login;
pub mod logout;
pub mod me;
pub mod repos;

pub use callback::callback;
pub use google_callback::google_callback;
pub use google_login::google_login;
pub use login::login;
pub use logout::logout;
pub use me::me;
pub use repos::repos;

#[derive(serde::Deserialize)]
pub struct CallbackParams {
    pub code: String,
}
