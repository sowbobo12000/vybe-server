import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../../config';
import { nanoid } from 'nanoid';

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: config.AWS_REGION,
      credentials: {
        accessKeyId: config.AWS_ACCESS_KEY_ID,
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

export interface PresignedUrlResult {
  uploadUrl: string;
  fileUrl: string;
  key: string;
}

/**
 * Generate a presigned URL for uploading an image to S3.
 */
export async function generatePresignedUploadUrl(
  folder: string,
  contentType: string,
  userId: string,
): Promise<PresignedUrlResult> {
  const client = getS3Client();
  const extension = contentType.split('/')[1] || 'jpg';
  const key = `${folder}/${userId}/${nanoid()}.${extension}`;

  const command = new PutObjectCommand({
    Bucket: config.S3_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    Metadata: {
      'uploaded-by': userId,
    },
  });

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: config.S3_PRESIGNED_URL_EXPIRATION,
  });

  const fileUrl = `https://${config.S3_BUCKET_NAME}.s3.${config.AWS_REGION}.amazonaws.com/${key}`;

  return { uploadUrl, fileUrl, key };
}

/**
 * Delete an object from S3.
 */
export async function deleteS3Object(key: string): Promise<void> {
  const client = getS3Client();
  const command = new DeleteObjectCommand({
    Bucket: config.S3_BUCKET_NAME,
    Key: key,
  });
  await client.send(command);
}

/**
 * Extract the S3 key from a full URL.
 */
export function extractKeyFromUrl(url: string): string | null {
  const prefix = `https://${config.S3_BUCKET_NAME}.s3.${config.AWS_REGION}.amazonaws.com/`;
  if (url.startsWith(prefix)) {
    return url.slice(prefix.length);
  }
  return null;
}
