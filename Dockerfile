FROM oven/bun:1-alpine

# Jest 29 no corre sobre el runtime de Bun: jest-runtime intenta escribir una
# propiedad de solo lectura del builtin `module` y falla al arrancar cualquier
# suite. La app corre con Bun; los tests corren con Node.
RUN apk add --no-cache nodejs

WORKDIR /app

COPY package.json bun.lockb* ./

RUN bun install

COPY . .

EXPOSE 3000

CMD ["bun", "run", "start:dev"]
