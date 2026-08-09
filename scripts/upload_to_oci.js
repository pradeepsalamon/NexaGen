const fs = require('fs');
const path = require('path');

// Try to resolve the AWS SDK from the API apps folder
let S3Client, PutObjectCommand;
try {
  const awsS3 = require('@aws-sdk/client-s3');
  S3Client = awsS3.S3Client;
  PutObjectCommand = awsS3.PutObjectCommand;
} catch (err) {
  console.error("Error: @aws-sdk/client-s3 not found. Run this script where the API node_modules are accessible.");
  process.exit(1);
}

async function uploadFile() {
  const filePath = process.argv[2];
  const bucketName = process.argv[3];
  const remoteKey = process.argv[4];
  const endpoint = process.argv[5];
  const region = process.argv[6];

  if (!filePath || !bucketName || !remoteKey || !endpoint || !region) {
    console.error("Usage: node upload_to_oci.js <file_path> <bucket> <remote_key> <endpoint> <region>");
    process.exit(1);
  }

  const s3Client = new S3Client({
    region,
    endpoint,
    credentials: {
      accessKeyId: process.env.OCI_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.OCI_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  });

  try {
    // Crucial: Use readFileSync to load into a Buffer.
    // This provides an exact Content-Length to the SDK, bypassing 'aws-chunked' transfer encoding
    // which is not supported by OCI S3 Compatibility API for streams.
    const fileBuffer = fs.readFileSync(filePath);

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: remoteKey,
      Body: fileBuffer,
      ContentType: 'application/gzip',
    });

    await s3Client.send(command);
    console.log("Upload successful.");
  } catch (error) {
    console.error("Upload failed:");
    console.error(error);
    process.exit(1);
  }
}

uploadFile();
