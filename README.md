# Buy Me a Pie Spring Webapp

A modern Spring Boot 3 web application for Buy Me a Pie shopping lists. It turns the capabilities from [`martinscholz/buymeapie-mcp-java`](https://github.com/martinscholz/buymeapie-mcp-java) into an intuitive browser UI while keeping Buy Me a Pie credentials on the server.

## Capabilities

- Validate account credentials and display account metadata.
- Show account and plan restrictions.
- List, create, rename, share, and delete shopping lists.
- List, add, edit, purchase/unpurchase, and delete shopping items.
- Load the autocomplete item dictionary for faster entry.
- Provide a responsive single-page interface backed by Spring Boot REST APIs.
- Run as a Docker container with health checks.

## Configuration

Credentials are read from environment variables and are never sent to the browser.

```bash
export BUYMEAPIE_USERNAME='your-email@example.com'
export BUYMEAPIE_PIN='your-pin'
export BUYMEAPIE_BASE_URL='https://api.buymeapie.com'
```

## Run locally

```bash
mvn spring-boot:run
```

Open [http://localhost:8080](http://localhost:8080).

## Docker

```bash
cp .env.example .env
docker compose up --build
```

Or build and run directly:

```bash
docker build -t buymeapie-spring-webapp .
docker run --rm -p 8080:8080 \
  -e BUYMEAPIE_USERNAME="$BUYMEAPIE_USERNAME" \
  -e BUYMEAPIE_PIN="$BUYMEAPIE_PIN" \
  buymeapie-spring-webapp
```

## API

The frontend uses these server-side routes:

- `GET /api/account`
- `GET /api/restrictions`
- `GET /api/lists`
- `POST /api/lists`
- `GET /api/lists/{listId}`
- `PUT /api/lists/{listId}`
- `DELETE /api/lists/{listId}`
- `GET /api/lists/{listId}/items`
- `POST /api/lists/{listId}/items`
- `PATCH /api/lists/{listId}/items/{itemId}`
- `PUT /api/lists/{listId}/items/{itemId}/purchased`
- `DELETE /api/lists/{listId}/items/{itemId}`
- `GET /api/unique-items`

## Safety

Deleting lists or items is permanent in Buy Me a Pie. The UI asks for confirmation before destructive operations.
