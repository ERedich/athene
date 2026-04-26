/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __GIT_COMMIT_HASH__: string;
declare const __GIT_COMMIT_TIMESTAMP__: string;

declare module "*.css?url" {
  const src: string;
  export default src;
}
