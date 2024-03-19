FROM node:18.19-bullseye-slim
COPY package* /demo/
COPY main.js /demo/
RUN cd /demo; npm i
WORKDIR /demo
ENTRYPOINT [ "node", "main.js" ]