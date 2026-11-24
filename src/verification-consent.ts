// Shared by the server and the client. Bump it whenever the consent text changes; consent is recorded per version.
export const VERIFICATION_CONSENT_VERSION = 'verification-v2';
// Consent for the camera path (live selfie and face comparison). Null until owner-approved text exists; while null the camera path is refused.
export const CAMERA_CONSENT_VERSION: string | null = 'verification-v3';
