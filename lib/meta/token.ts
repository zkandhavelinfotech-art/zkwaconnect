import crypto from "node:crypto"

function encryptionKey() {
  const secret = process.env.ENCRYPTION_KEY
  if (!secret || secret.length < 32 || /replace-with|example|your-/i.test(secret))
    throw new Error("Set a strong ENCRYPTION_KEY of at least 32 characters in .env")
  return crypto.createHash("sha256").update(secret).digest()
}

export function encryptMetaToken(token: string) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()])
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(":")
}

export function decryptMetaToken(value: string) {
  const [version, ivValue, tagValue, ciphertextValue] = value.split(":")
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue)
    throw new Error("Stored Meta access token has an unsupported format")

  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"))
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}