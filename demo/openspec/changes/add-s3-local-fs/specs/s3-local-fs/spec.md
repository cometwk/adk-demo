## ADDED Requirements

### Requirement: Content-addressed storage with blob identifiers
The system SHALL model stored data in a single `file_blobs` table:
- A content layer identified by a cryptographic hash (the “blob”).
- A non-enumerable `file_id` that is the blob's primary key (`file_blobs.id`).

#### Scenario: Upload returns file identifier
- **WHEN** a client uploads a file successfully
- **THEN** the system returns a `file_id` as the primary identifier to be used by clients
- **AND** the system SHALL NOT require clients to know the blob hash to download or preview the file

### Requirement: Blob uniqueness by SHA-256 hash
The system SHALL compute a SHA-256 hash for uploaded content and use it as the uniqueness key for blobs.

#### Scenario: Duplicate content is de-duplicated
- **WHEN** two uploads have identical content bytes
- **THEN** the system persists exactly one blob record for that hash
- **AND** both uploads return the same `file_id`

### Requirement: Local filesystem storage layout
The system SHALL store blob content on local filesystem using a two-level directory layout derived from the hash:
`/<root>/<hash[0:2]>/<hash[2:4]>/<hash>`.

#### Scenario: Storage path is deterministic
- **WHEN** a blob hash is `h`
- **THEN** the system can deterministically derive the storage path from `h`

### Requirement: Upload SHALL be streaming and bounded-memory
The system SHALL implement uploads without reading the entire file into memory, computing the blob hash while streaming the request body.

#### Scenario: Large file upload does not require full buffering
- **WHEN** a client uploads a large file via multipart/form-data
- **THEN** the system processes the upload with bounded memory usage (independent of file size)

### Requirement: Concurrent deduplication correctness
The system SHALL remain correct under concurrent uploads of identical content by relying on a database uniqueness constraint on blob hash.

#### Scenario: Concurrent identical uploads
- **WHEN** two clients concurrently upload identical content
- **THEN** at most one blob insert succeeds
- **AND** the other upload reuses the existing blob without persisting a second copy of content

### Requirement: Download and preview handlers
The system SHALL provide Echo handlers to retrieve a file by `file_id`, intended to be mounted as:
- `GET /files/:file_id` for download (`Content-Disposition: attachment`)
- `GET /files/:file_id/preview` for inline preview (`Content-Disposition: inline`)

#### Scenario: Download returns attachment disposition
- **WHEN** a client request is handled by the download handler (mounted at `GET /files/:file_id`)
- **THEN** the response includes `Content-Disposition: attachment`

#### Scenario: Preview returns inline disposition
- **WHEN** a client request is handled by the preview handler (mounted at `GET /files/:file_id/preview`)
- **THEN** the response includes `Content-Disposition: inline`

### Requirement: HTTP Range support for preview/download
The system SHALL support byte ranges (RFC 7233) for file retrieval to enable media streaming and PDF partial loading.

#### Scenario: Full content when no Range header
- **WHEN** a client request is handled without a `Range` header
- **THEN** the system returns `200 OK` with the full content

#### Scenario: Partial content with valid Range header
- **WHEN** a client request is handled with a valid `Range: bytes=start-end` header
- **THEN** the system returns `206 Partial Content`
- **AND** includes `Accept-Ranges: bytes`
- **AND** includes a valid `Content-Range: bytes start-end/total` header

#### Scenario: Range not satisfiable
- **WHEN** a client request is handled with an invalid or unsatisfiable range
- **THEN** the system returns `416 Range Not Satisfiable`
- **AND** includes `Content-Range: bytes */total`

