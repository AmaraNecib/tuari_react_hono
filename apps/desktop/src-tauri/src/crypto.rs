use ed25519_dalek::{Signature, VerifyingKey};
use rand::rngs::OsRng;
use rand::RngCore;
use sha2::{Digest, Sha256};

/// Error type for cryptographic operations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CryptoError {
    InvalidSignature,
    InvalidKey,
    InvalidInput,
    CryptoBackend(String),
}

impl std::fmt::Display for CryptoError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CryptoError::InvalidSignature => write!(f, "invalid signature"),
            CryptoError::InvalidKey => write!(f, "invalid public key"),
            CryptoError::InvalidInput => write!(f, "invalid input"),
            CryptoError::CryptoBackend(msg) => write!(f, "crypto backend error: {}", msg),
        }
    }
}

impl std::error::Error for CryptoError {}

/// Verify an Ed25519 signature against a public key.
///
/// # Arguments
/// * `public_key` - 32-byte Ed25519 public key
/// * `message` - The message that was signed
/// * `signature` - 64-byte Ed25519 signature
///
/// # Returns
/// * `Ok(())` if the signature is valid
/// * `Err(CryptoError::InvalidSignature)` if the signature is invalid
pub fn ed25519_verify(
    public_key: &[u8; 32],
    message: &[u8],
    signature: &[u8; 64],
) -> Result<(), CryptoError> {
    let verifying_key = VerifyingKey::from_bytes(public_key)
        .map_err(|_| CryptoError::InvalidKey)?;
    let sig = Signature::from_slice(signature.as_slice())
        .map_err(|_| CryptoError::InvalidSignature)?;
    verifying_key
        .verify_strict(message, &sig)
        .map_err(|_| CryptoError::InvalidSignature)
}

/// Compute the SHA-256 digest of data.
pub fn sha256_digest(data: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(data);
    let result = hasher.finalize();
    let mut out = [0u8; 32];
    out.copy_from_slice(&result);
    out
}

/// Generate cryptographically secure random bytes.
///
/// Wraps `OsRng`. Panics only if the OS entropy source fails.
pub fn generate_random_bytes(len: usize) -> Vec<u8> {
    let mut bytes = vec![0u8; len];
    OsRng.fill_bytes(&mut bytes);
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::Signer;

    /// Generate an ed25519 keypair for testing.
    /// Uses `From<[u8; 32]>` for SecretKey and `from_bytes` for SigningKey.
    fn test_keypair() -> (ed25519_dalek::SigningKey, [u8; 32]) {
        let mut secret = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut secret);

        let secret_key: ed25519_dalek::SecretKey = secret.into();
        let signing_key = ed25519_dalek::SigningKey::from_bytes(&secret_key);
        let verifying_key = signing_key.verifying_key().to_bytes();

        (signing_key, verifying_key)
    }

    #[test]
    fn ed25519_verify_valid_signature() {
        let (signing_key, verifying_key_bytes) = test_keypair();
        let message = b"test message";
        let signature = signing_key.sign(message);
        let sig_bytes: [u8; 64] = signature.to_bytes();

        let result = ed25519_verify(&verifying_key_bytes, message, &sig_bytes);
        assert!(result.is_ok(), "valid signature should return Ok");
    }

    #[test]
    fn ed25519_verify_tampered_message() {
        let (signing_key, verifying_key_bytes) = test_keypair();
        let message = b"original message";
        let signature = signing_key.sign(message);
        let sig_bytes: [u8; 64] = signature.to_bytes();

        let tampered_message = b"tampered message";
        let result = ed25519_verify(&verifying_key_bytes, tampered_message, &sig_bytes);
        assert!(result.is_err(), "tampered message should fail verification");
        assert_eq!(result.unwrap_err(), CryptoError::InvalidSignature);
    }

    #[test]
    fn ed25519_verify_wrong_key() {
        let (signing_key, _) = test_keypair();
        let message = b"test message";
        let signature = signing_key.sign(message);
        let sig_bytes: [u8; 64] = signature.to_bytes();

        let (_, wrong_key_bytes) = test_keypair();

        let result = ed25519_verify(&wrong_key_bytes, message, &sig_bytes);
        assert!(result.is_err(), "wrong key should fail verification");
        assert_eq!(result.unwrap_err(), CryptoError::InvalidSignature);
    }

    #[test]
    fn ed25519_verify_invalid_key() {
        let invalid_key = [0u8; 32]; // all zeros is not a valid Ed25519 key
        let sig_bytes = [0u8; 64];
        let message = b"test";

        let result = ed25519_verify(&invalid_key, message, &sig_bytes);
        assert!(result.is_err(), "invalid key should return error");
    }

    #[test]
    fn sha256_digest_empty() {
        let result = sha256_digest(b"");
        let expected: [u8; 32] = [
            0xe3, 0xb0, 0xc4, 0x42, 0x98, 0xfc, 0x1c, 0x14,
            0x9a, 0xfb, 0xf4, 0xc8, 0x99, 0x6f, 0xb9, 0x24,
            0x27, 0xae, 0x41, 0xe4, 0x64, 0x9b, 0x93, 0x4c,
            0xa4, 0x95, 0x99, 0x1b, 0x78, 0x52, 0xb8, 0x55,
        ];
        assert_eq!(result, expected, "SHA-256 of empty string should match known value");
    }

    #[test]
    fn sha256_digest_known_input() {
        let result = sha256_digest(b"hello world");
        let expected: [u8; 32] = [
            0xb9, 0x4d, 0x27, 0xb9, 0x93, 0x4d, 0x3e, 0x08,
            0xa5, 0x2e, 0x52, 0xd7, 0xda, 0x7d, 0xab, 0xfa,
            0xc4, 0x84, 0xef, 0xe3, 0x7a, 0x53, 0x80, 0xee,
            0x90, 0x88, 0xf7, 0xac, 0xe2, 0xef, 0xcd, 0xe9,
        ];
        assert_eq!(result, expected, "SHA-256 of 'hello world' should match known value");
    }

    #[test]
    fn sha256_digest_different_inputs() {
        let hash1 = sha256_digest(b"input1");
        let hash2 = sha256_digest(b"input2");
        assert_ne!(hash1, hash2, "different inputs should produce different hashes");
    }

    #[test]
    fn generate_random_bytes_length() {
        let bytes = generate_random_bytes(32);
        assert_eq!(bytes.len(), 32, "should produce exactly 32 bytes");

        let bytes = generate_random_bytes(64);
        assert_eq!(bytes.len(), 64, "should produce exactly 64 bytes");

        let bytes = generate_random_bytes(0);
        assert_eq!(bytes.len(), 0, "should produce empty vec for length 0");
    }

    #[test]
    fn generate_random_bytes_uniqueness() {
        let bytes1 = generate_random_bytes(32);
        let bytes2 = generate_random_bytes(32);
        assert_ne!(bytes1, bytes2, "two calls should produce different values");
    }

    #[test]
    fn generate_random_bytes_not_zero() {
        let bytes = generate_random_bytes(32);
        assert!(
            bytes.iter().any(|&b| b != 0),
            "output should not be all zeros"
        );
    }

    #[test]
    fn crypto_error_display() {
        assert_eq!(
            format!("{}", CryptoError::InvalidSignature),
            "invalid signature"
        );
        assert_eq!(format!("{}", CryptoError::InvalidKey), "invalid public key");
        assert_eq!(format!("{}", CryptoError::InvalidInput), "invalid input");
        assert!(format!("{}", CryptoError::CryptoBackend("test".into())).contains("test"));
    }

    #[test]
    fn crypto_error_send_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<CryptoError>();
    }
}

