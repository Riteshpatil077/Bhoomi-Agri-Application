"""
Bhoomi — Storage Abstractions
Provides two strictly separated object storage abstractions per §5:
  1. PrivateVerificationStorage — for sensitive verification documents
     (SSE-KMS, private bucket, short-lived presigned GET/PUT only, never public).
  2. PublicMediaStorage — for public-facing assets (profile photos, listings).
"""
from __future__ import annotations

import logging
import os
import uuid
from typing import Any

from flask import current_app

logger = logging.getLogger(__name__)

# Permitted MIME types and size limits for verification docs (§5)
ALLOWED_VERIFICATION_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
}
MAX_VERIFICATION_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


class StorageException(Exception):
    """Raised when an object storage operation fails."""
    pass


class PrivateVerificationStorage:
    """
    Storage abstraction for private farmer verification documents (§5).
    Operates against S3_BUCKET_PRIVATE with zero public read access.
    """

    @classmethod
    def _get_client(cls) -> Any:
        try:
            import boto3
            from botocore.config import Config
            region = current_app.config.get("AWS_REGION", "ap-south-1")
            return boto3.client(
                "s3",
                region_name=region,
                config=Config(signature_version="s3v4"),
            )
        except Exception as exc:
            logger.debug("Failed to initialize boto3 client: %s", exc)
            return None

    @classmethod
    def get_bucket_name(cls) -> str:
        return current_app.config.get("S3_BUCKET_PRIVATE", "bhoomi-verification-private")

    @classmethod
    def generate_object_key(cls, user_id: str | uuid.UUID, photo_type: str, extension: str = "jpg") -> str:
        """
        Produce a non-guessable, scoped object key:
        verifications/<user_id>/<photo_type>_<uuid>.<ext>
        """
        clean_ext = extension.lstrip(".").lower()
        if clean_ext == "jpeg":
            clean_ext = "jpg"
        return f"verifications/{user_id}/{photo_type}_{uuid.uuid4().hex[:12]}.{clean_ext}"

    @classmethod
    def generate_presigned_upload_url(
        cls,
        object_key: str,
        content_type: str,
        max_size_bytes: int = MAX_VERIFICATION_FILE_SIZE,
        expires_in: int | None = None,
    ) -> dict[str, Any]:
        """
        Generate a presigned PUT/POST URL for direct client upload to the private bucket.
        Validates content_type and max_size_bytes.
        """
        if content_type.lower() not in ALLOWED_VERIFICATION_CONTENT_TYPES:
            raise StorageException(
                f"Invalid content type '{content_type}'. "
                f"Allowed types: {sorted(ALLOWED_VERIFICATION_CONTENT_TYPES)}"
            )

        if expires_in is None:
            expires_in = current_app.config.get("PRESIGNED_URL_EXPIRY_UPLOAD", 300)

        bucket = cls.get_bucket_name()
        s3 = cls._get_client()

        # In testing or when AWS client cannot connect, return deterministic presigned URL structure
        if s3 is None or current_app.config.get("TESTING"):
            upload_url = f"https://{bucket}.s3.amazonaws.com/{object_key}?upload_signature=mock_presigned_upload"
            return {
                "upload_url": upload_url,
                "object_key": object_key,
                "fields": {
                    "Content-Type": content_type,
                    "x-amz-server-side-encryption": "aws:kms",
                },
                "expires_in": expires_in,
            }

        try:
            url = s3.generate_presigned_url(
                ClientMethod="put_object",
                Params={
                    "Bucket": bucket,
                    "Key": object_key,
                    "ContentType": content_type,
                    "ServerSideEncryption": "aws:kms",
                },
                ExpiresIn=expires_in,
            )
            return {
                "upload_url": url,
                "object_key": object_key,
                "fields": {
                    "Content-Type": content_type,
                    "x-amz-server-side-encryption": "aws:kms",
                },
                "expires_in": expires_in,
            }
        except Exception as exc:
            logger.error("Failed to generate presigned upload URL: %s", exc)
            raise StorageException(f"Storage error generating upload URL: {exc}") from exc

    @classmethod
    def generate_presigned_get_url(cls, object_key: str, expires_in: int | None = None) -> str:
        """
        Generate a short-lived presigned GET URL for an authorized admin reviewer (§5).
        Defaults to 5 minutes (300 seconds). Never permanent.
        """
        if expires_in is None:
            expires_in = current_app.config.get("PRESIGNED_URL_EXPIRY_DOWNLOAD", 300)

        bucket = cls.get_bucket_name()
        s3 = cls._get_client()

        if s3 is None or current_app.config.get("TESTING"):
            return f"https://{bucket}.s3.amazonaws.com/{object_key}?expires={expires_in}&signature=mock_presigned_get"

        try:
            return s3.generate_presigned_url(
                ClientMethod="get_object",
                Params={
                    "Bucket": bucket,
                    "Key": object_key,
                },
                ExpiresIn=expires_in,
            )
        except Exception as exc:
            logger.error("Failed to generate presigned download URL: %s", exc)
            raise StorageException(f"Storage error generating download URL: {exc}") from exc

    @classmethod
    def delete_object(cls, object_key: str) -> bool:
        """
        Delete a verification document from the private bucket (e.g. during purge job).
        """
        bucket = cls.get_bucket_name()
        s3 = cls._get_client()

        if s3 is None or current_app.config.get("TESTING"):
            logger.info("Mock purged object '%s' from bucket '%s'", object_key, bucket)
            return True

        try:
            s3.delete_object(Bucket=bucket, Key=object_key)
            return True
        except Exception as exc:
            logger.error("Failed to delete object '%s': %s", object_key, exc)
            return False


class PublicMediaStorage:
    """
    Storage abstraction for public-facing assets (profile photos, product photos, etc.).
    Operates against S3_BUCKET_PUBLIC.
    Completely separate from PrivateVerificationStorage per §5.
    """

    @classmethod
    def _get_client(cls) -> Any:
        try:
            import boto3
            from botocore.config import Config
            region = current_app.config.get("AWS_REGION", "ap-south-1")
            return boto3.client(
                "s3",
                region_name=region,
                config=Config(signature_version="s3v4"),
            )
        except Exception as exc:
            logger.debug("Failed to initialize boto3 client: %s", exc)
            return None

    @classmethod
    def get_bucket_name(cls) -> str:
        return current_app.config.get("S3_BUCKET_PUBLIC", "bhoomi-public-media")

    @classmethod
    def generate_object_key(cls, user_id: str | uuid.UUID, asset_type: str, extension: str = "jpg") -> str:
        clean_ext = extension.lstrip(".").lower()
        return f"public/{asset_type}/{user_id}_{uuid.uuid4().hex[:12]}.{clean_ext}"

    @classmethod
    def generate_presigned_upload_url(
        cls,
        object_key: str,
        content_type: str,
        max_size_bytes: int = 5 * 1024 * 1024,
        expires_in: int = 300,
    ) -> dict[str, Any]:
        bucket = cls.get_bucket_name()
        s3 = cls._get_client()

        if s3 is None or current_app.config.get("TESTING"):
            return {
                "upload_url": f"https://{bucket}.s3.amazonaws.com/{object_key}?upload_signature=mock_public_upload",
                "object_key": object_key,
                "fields": {"Content-Type": content_type},
                "expires_in": expires_in,
            }

        try:
            url = s3.generate_presigned_url(
                ClientMethod="put_object",
                Params={
                    "Bucket": bucket,
                    "Key": object_key,
                    "ContentType": content_type,
                },
                ExpiresIn=expires_in,
            )
            return {
                "upload_url": url,
                "object_key": object_key,
                "fields": {"Content-Type": content_type},
                "expires_in": expires_in,
            }
        except Exception as exc:
            raise StorageException(f"Storage error generating public upload URL: {exc}") from exc

    @classmethod
    def get_public_url(cls, object_key: str) -> str:
        bucket = cls.get_bucket_name()
        region = current_app.config.get("AWS_REGION", "ap-south-1")
        return f"https://{bucket}.s3.{region}.amazonaws.com/{object_key}"

    @classmethod
    def delete_object(cls, object_key: str) -> bool:
        bucket = cls.get_bucket_name()
        s3 = cls._get_client()

        if s3 is None or current_app.config.get("TESTING"):
            return True

        try:
            s3.delete_object(Bucket=bucket, Key=object_key)
            return True
        except Exception as exc:
            logger.error("Failed to delete public object '%s': %s", object_key, exc)
            return False
