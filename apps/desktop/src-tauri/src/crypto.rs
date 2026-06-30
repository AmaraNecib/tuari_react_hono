// Rust Core — shared cryptographic utilities
// Implementation: M1.1 Slice 2
// TODO: implement ed25519_verify, sha256_digest, generate_random_bytes

pub enum CryptoError {
    InvalidSignature,
    InvalidKey,
    InvalidInput,
    CryptoBackend(String),
}

