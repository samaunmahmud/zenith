# Zenith: one container serving the React frontend and the Spring Boot API on one URL.
# Build:  docker build -t zenith .
# Run:    docker run -p 8080:8080 --env-file .env -e PORT=8080 -e MAX_SPEND_USD=0 zenith
#         (-e wins over --env-file: .env sets PORT=3001 for dev, and MAX_SPEND_USD=0 keeps a local test free)

# 1) Build the React frontend
FROM node:22-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
RUN npm ci --workspace frontend --include-workspace-root=false
COPY frontend/ frontend/
RUN npm run build --workspace frontend

# 2) Build the Spring Boot jar, with the frontend bundled in as static files
FROM maven:3-eclipse-temurin-24 AS backend
WORKDIR /app
COPY backend/pom.xml .
RUN mvn -q -B dependency:go-offline
COPY backend/src src
COPY --from=frontend /app/frontend/dist src/main/resources/static
RUN mvn -q -B package -DskipTests

# 3) Small runtime image: JRE only, non-root user
FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd --system --create-home zenith
COPY --from=backend /app/target/zenith.jar zenith.jar
# Pre-cached demo tickers (run `npm run precache` before building) so the demo works even if APIs are rate-limited.
COPY --chown=zenith cache/ cache/
USER zenith
ENV PORT=8080 \
    CACHE_DIR=/app/cache \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75"
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD curl -fs http://localhost:8080/api/health || exit 1
ENTRYPOINT ["java", "-jar", "zenith.jar"]
