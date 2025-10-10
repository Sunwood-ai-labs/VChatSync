FROM nginx:1.27.0-alpine

WORKDIR /usr/share/nginx/html

# Copy static site assets into the image
COPY index.html ./index.html
COPY app.js ./app.js
COPY styles.css ./styles.css
COPY favicon.svg ./favicon.svg

# Copy nginx configuration
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Create directory for certificates (mounted at runtime)
RUN mkdir -p /etc/nginx/certs

EXPOSE 80 443
