use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};

use super::models::Claims;

/// Create a signed JWT from the given claims.
pub fn create_token(secret: &str, claims: &Claims) -> Result<String, jsonwebtoken::errors::Error> {
    encode(
        &Header::default(),
        claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
}

/// Verify and decode a JWT, returning the claims on success.
pub fn verify_token(secret: &str, token: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )?;
    Ok(token_data.claims)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn now_secs() -> usize {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as usize
    }

    #[test]
    fn test_roundtrip() {
        let secret = "test-secret-key-256-bits-long-ok";
        let claims = Claims {
            sub: "12345".into(),
            username: "testuser".into(),
            session_id: "sess-abc".into(),
            iat: now_secs(),
            exp: now_secs() + 3600,
        };

        let token = create_token(secret, &claims).expect("should create token");
        let decoded = verify_token(secret, &token).expect("should verify token");

        assert_eq!(decoded.sub, "12345");
        assert_eq!(decoded.username, "testuser");
        assert_eq!(decoded.session_id, "sess-abc");
    }

    #[test]
    fn test_expired_token() {
        let secret = "test-secret-key-256-bits-long-ok";
        let claims = Claims {
            sub: "12345".into(),
            username: "testuser".into(),
            session_id: "sess-abc".into(),
            iat: now_secs() - 7200,
            exp: now_secs() - 3600, // expired 1 hour ago
        };

        let token = create_token(secret, &claims).expect("should create token");
        let result = verify_token(secret, &token);
        assert!(result.is_err(), "expired token should be rejected");
    }

    #[test]
    fn test_invalid_signature() {
        let claims = Claims {
            sub: "12345".into(),
            username: "testuser".into(),
            session_id: "sess-abc".into(),
            iat: now_secs(),
            exp: now_secs() + 3600,
        };

        let token = create_token("correct-secret", &claims).expect("should create token");
        let result = verify_token("wrong-secret", &token);
        assert!(result.is_err(), "wrong secret should be rejected");
    }
}
