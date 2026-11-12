# 1. Front : build Vite
FROM node:24-alpine AS front
WORKDIR /front
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# 2. Back : JAR Spring Boot qui embarque le front en fichiers statiques
FROM eclipse-temurin:21-jdk AS back
WORKDIR /back
COPY backend/.mvn .mvn
COPY backend/mvnw backend/pom.xml ./
RUN ./mvnw -B -q dependency:go-offline
COPY backend/src src
COPY --from=front /front/dist src/main/resources/static
RUN ./mvnw -B -q package -DskipTests

# 3. Exécution
FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd --system --uid 1001 reassort
COPY --from=back /back/target/reassort-*.jar app.jar
USER reassort
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
