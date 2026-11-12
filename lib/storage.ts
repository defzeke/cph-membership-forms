import "server-only";
import { S3Client } from "@aws-sdk/client-s3";

// Credentials, endpoint and region come from the AWS_* vars `neon env pull` writes.
export const s3 = new S3Client({ forcePathStyle: true }); // Neon requires path-style
export const ASSETS_BUCKET = "assets"; // declared in neon.ts
