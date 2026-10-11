# Zenith: one container serving the React frontend and the Spring Boot API on one URL.
# Build:  docker build -t zenith .
# Run:    docker run -p 8080:8080 --env-file .env -e PORT=8080 -e MAX_SPEND_USD=0 zenith
#         (-e wins over --env-file: .env sets PORT=3001 for dev, and MAX_SPEND_USD=0 keeps a local test free)

# 1) Build the React frontend. The build stages run on the build machine's own architecture (BUILDPLATFORM): their
#    outputs (a JS bundle and a jar) are the same on any CPU, so cross-building for linux/amd64 from an ARM Mac only
#    emulates the final stage.
FROM --platform=$BUILDPLATFORM node:22-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
RUN npm ci --workspace frontend --include-workspace-root=false
COPY frontend/ frontend/
RUN npm run build --workspace frontend

# 2) Build the Spring Boot jar, with the frontend bundled in as static files
FROM --platform=$BUILDPLATFORM maven:3.9-eclipse-temurin-21 AS backend
WORKDIR /app
COPY backend/pom.xml .
RUN mvn -q -B dependency:go-offline
COPY backend/src src
COPY --from=frontend /app/frontend/dist src/main/resources/static
RUN mvn -q -B package -DskipTests

# 3) Small runtime image: JRE only, non-root user
FROM eclipse-temurin:21-jre
WORKDIR /app
# UID 1000, which Hugging Face Spaces runs containers as (the base image's "ubuntu" user had it), so the app can
# always write its cache; nothing else depends on the number.
RUN (userdel --remove ubuntu 2>/dev/null || true) && useradd --uid 1000 --create-home zenith
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
