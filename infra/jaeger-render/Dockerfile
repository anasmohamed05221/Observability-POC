# Render's free Web Service tier only exposes one public port, but Jaeger needs two
# (4318 for receiving traces, 16686 for its UI). This image runs both Jaeger and a tiny
# nginx reverse proxy in one container: nginx listens on the single exposed port and
# routes by path to whichever of Jaeger's internal ports the request actually needs.
FROM jaegertracing/all-in-one:latest AS jaeger

FROM nginx:alpine
COPY --from=jaeger / /jaeger-root/
COPY nginx.conf /etc/nginx/nginx.conf
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 8080
CMD ["/start.sh"]