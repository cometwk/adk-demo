# API Auth Specification

## Purpose
Define authentication and session management behavior for the public APIs, including how clients obtain tokens and how the system treats authenticated requests.

## Requirements
### Requirement: User Authentication
The system SHALL issue a JWT on successful login.

#### Scenario: Valid credentials
- WHEN a user submits valid credentials
- THEN a JWT is returned
