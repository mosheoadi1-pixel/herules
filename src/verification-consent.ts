// Shared by the server and the client. Bump it whenever the consent text changes; consent is recorded per version.
export const VERIFICATION_CONSENT_VERSION = 'verification-v4';
// Camera consent also covers the live selfie and face comparison. While null the camera path is refused.
export const CAMERA_CONSENT_VERSION: string | null = 'verification-v5';
