# VitePress Render

This repository contains the source code for the VitePress Render plugin. This plugin is able to show a component from a file.

## 🚀 Installation

To install the plugin, add the `vitepress-plugin-render` package to your project using `pnpm install vitepress-plugin-render` and add the following to your VitePress config:

```ts
import renderPlugin from 'vitepress-plugin-render';

export default defineConfig({
    // ...
    markdown: {
        config(md) {
            md.use(renderPlugin);
        }
    }
    // ... 
});
```

## 👀 Usage

```markdown
::: render
render=../path/to/file.vue
:::
```
