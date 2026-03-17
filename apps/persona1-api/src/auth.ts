import crypto from "node:crypto";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

interface AuthPayload {
  userId: string;
  email: string;
  issuedAt: string;
}

export interface AuthTokenService {
  mode: "local_hmac" | "firebase_jwt";
  canIssueTokens: boolean;
  sign(payload: AuthPayload): Promise<string | null>;
  verify(token: string): Promise<AuthPayload | null>;
}

export function createLocalHmacAuthTokenService(secret: string): AuthTokenService {
  return {
    mode: "local_hmac",
    canIssueTokens: true,

    async sign(payload) {
      const encodedPayload = base64UrlEncode(JSON.stringify(payload));
      const signature = signSegment(encodedPayload, secret);
      return `${encodedPayload}.${signature}`;
    },

    async verify(token) {
      const [payloadSegment, signature] = token.split(".");
      if (!payloadSegment || !signature) {
        return null;
      }

      const expectedSignature = signSegment(payloadSegment, secret);
      if (
        Buffer.byteLength(signature) !== Buffer.byteLength(expectedSignature) ||
        !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
      ) {
        return null;
      }

      try {
        return JSON.parse(base64UrlDecode(payloadSegment)) as AuthPayload;
      } catch {
        return null;
      }
    }
  };
}

export function createFirebaseJwtVerifier(options: {
  projectId: string;
  serviceAccountJson?: string | null;
  fetchImpl?: typeof fetch;
}): AuthTokenService {
  const fetchImpl = options.fetchImpl ?? fetch;
  const app = getOrCreateFirebaseApp({
    projectId: options.projectId,
    serviceAccountJson: options.serviceAccountJson ?? null
  });
  const auth = app ? getAuth(app) : null;

  return {
    mode: "firebase_jwt",
    canIssueTokens: false,

    async sign() {
      return null;
    },

    async verify(token) {
      if (auth) {
        try {
          const decoded = await auth.verifyIdToken(token);
          if (typeof decoded.uid !== "string" || typeof decoded.email !== "string") {
            return null;
          }

          return {
            userId: decoded.uid,
            email: decoded.email,
            issuedAt: new Date(Number(decoded.iat ?? 0) * 1000 || Date.now()).toISOString()
          };
        } catch {
          return null;
        }
      }

      const parts = token.split(".");
      if (parts.length !== 3) {
        return null;
      }

      const encodedHeader = parts[0];
      const encodedPayload = parts[1];
      const encodedSignature = parts[2];
      if (!encodedHeader || !encodedPayload || !encodedSignature) {
        return null;
      }
      const header = JSON.parse(base64UrlDecode(encodedHeader)) as { alg?: string; kid?: string };
      const payload = JSON.parse(base64UrlDecode(encodedPayload)) as Record<string, unknown>;

      if (header.alg !== "RS256" || !header.kid) {
        return null;
      }

      if (payload.aud !== options.projectId || payload.iss !== `https://securetoken.google.com/${options.projectId}`) {
        return null;
      }

      if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) {
        return null;
      }

      if (typeof payload.user_id !== "string" || typeof payload.email !== "string") {
        return null;
      }

      const certificates = await fetchFirebaseCertificates(fetchImpl);
      const certificate = certificates[header.kid];
      if (!certificate) {
        return null;
      }

      const verifier = crypto.createVerify("RSA-SHA256");
      verifier.update(`${encodedHeader}.${encodedPayload}`);
      verifier.end();

      const valid = verifier.verify(certificate, Buffer.from(encodedSignature, "base64url"));
      if (!valid) {
        return null;
      }

      return {
        userId: payload.user_id,
        email: payload.email,
        issuedAt: new Date(Number(payload.iat ?? 0) * 1000 || Date.now()).toISOString()
      };
    }
  };
}

function getOrCreateFirebaseApp(input: {
  projectId: string;
  serviceAccountJson: string | null;
}) {
  try {
    const existing = getApps().find((app) => app.name === `persona1-${input.projectId}`);
    if (existing) {
      return existing;
    }

    if (input.serviceAccountJson) {
      const parsed = JSON.parse(input.serviceAccountJson) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      return initializeApp(
        {
          credential: cert({
            projectId: parsed.project_id ?? input.projectId,
            clientEmail: parsed.client_email ?? "",
            privateKey: parsed.private_key ?? ""
          }),
          projectId: parsed.project_id ?? input.projectId
        },
        `persona1-${input.projectId}`
      );
    }

    return initializeApp(
      {
        credential: applicationDefault(),
        projectId: input.projectId
      },
      `persona1-${input.projectId}`
    );
  } catch {
    return null;
  }
}

async function fetchFirebaseCertificates(fetchImpl: typeof fetch) {
  const response = await fetchImpl(
    "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
  );
  if (!response.ok) {
    throw new Error(`Could not fetch Firebase signing certificates: ${response.status}`);
  }

  return (await response.json()) as Record<string, string>;
}

function signSegment(value: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}
