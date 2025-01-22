import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Options, Renderer, Token } from 'markdown-it';
import type MarkdownIt from 'markdown-it';
import MarkdownItContainer from 'markdown-it-container';

const IS_RENDER_RE = /^render=(.+)$/;
const SCRIPT_SETUP_RE = /<\s*script[^>]*\bsetup\b[^>]*/;
const SCRIPT_SETUP_TS_RE = /<\s*script[^>]*\blang=['"]ts['"][^>]*/;
const SCRIPT_SETUP_COMMON_RE = /<\s*script\s+(setup|lang='ts'|lang="ts")?\s*(setup|lang='ts'|lang="ts")?\s*>/;
const VALIDATE_CONTAINER_RE = /^render.*$/;

const composeComponentName = (path: string): string => {
    let running = true;
    const componentList: string[] = [];

    while (running) {
        const lastIndex = path.lastIndexOf('/');

        if (lastIndex === -1) {
            running = false;
            break;
        }

        componentList.unshift(path.substring(lastIndex + 1));
        path = path.substring(0, lastIndex);
    }

    return componentList
        .filter(i => i !== '' && i !== '.' && i !== '..')
        .join('-')
        .split('.')[0];
};

const convertToRelativePath = (path: string) => {
    if (path.startsWith('./') || path.startsWith('../') || path.startsWith('/')) {
        return path;
    }

    return `./${path}`;
};

const injectComponent = (env: any, path: string, componentName: string) => {
    const scripts = env.sfcBlocks.scripts as any[];
    const setupIndex = scripts.findIndex(s => SCRIPT_SETUP_RE.test(s.tagOpen) || SCRIPT_SETUP_TS_RE.test(s.tagOpen));

    componentName = normalizeComponentName(componentName);

    if (setupIndex === -1) {
        scripts.push({
            type: 'script',
            tagClose: '</script>',
            tagOpen: `<script lang="ts" setup>`,
            content: `
                <script lang="ts" setup>
                    import ${componentName} from '${path}';
                </script>`,
            contentStripped: `import ${componentName} from '${path}';`
        });
    } else {
        const oldScript = scripts[setupIndex];

        if (oldScript.content.includes(path) && oldScript.content.includes(componentName)) {
            scripts[0].content = oldScript.content;
        } else {
            const block = '<script lang="ts" setup>';
            scripts[setupIndex].content = scripts[setupIndex].content.replace(SCRIPT_SETUP_COMMON_RE, block);
            scripts[setupIndex].content = scripts[setupIndex].content.replace(block, `<script lang="ts" setup>\nimport ${componentName} from '${path}';\n`);
        }
    }
};

const normalizeComponentName = (componentName: string) => componentName.replaceAll(/[_|-]+(\w)/g, (_, name) => name.toUpperCase());

const directive = (md: MarkdownIt) => {
    md.use(MarkdownItContainer, 'render', {
        marker: ':',
        validate(params: string) {
            const matches = params.trim().match(VALIDATE_CONTAINER_RE);
            return matches && matches.length > 0;
        }
    });
};

const parseContainer = (md: MarkdownIt) => {
    const defaultHtmlTextRender = md.renderer.rules.text!;
    md.renderer.rules.text = (tokens: Token[], idx: number, options: Options, env: any, self: Renderer): string => {
        const token = tokens[idx];

        if (token.type === 'text' && token.content.match(IS_RENDER_RE)) {
            const relativePath = convertToRelativePath(token.content.match(IS_RENDER_RE)![1]);
            const componentName = composeComponentName(relativePath);

            injectComponent(env, relativePath, componentName);

            return `<${componentName}/>`;
        }

        return defaultHtmlTextRender(tokens, idx, options, env, self);
    };
};

const parseTag = (md: MarkdownIt) => {
    const defaultContainerExampleOpenRender = md.renderer.rules.container_render_open!;

    let sourceCodeHighlighted: string | null = null;

    // :::render
    md.renderer.rules.container_render_open = (tokens: Token[], idx: number, options: Options, env: any, self: Renderer): string => {
        const token = tokens[idx];
        const relativePath = convertToRelativePath(tokens[idx + 2].content.split('=')[1]);
        const componentPath = resolve(dirname(env.path), relativePath || '.');

        const suffix = componentPath.substring(componentPath.lastIndexOf('.') + 1);
        const sourceCode = readFileSync(componentPath, 'utf-8');
        sourceCodeHighlighted = md.options.highlight!(sourceCode, suffix, '');

        const componentName = composeComponentName(componentPath);

        if (token.nesting === 1) {
            return `
                <div class="vite-render" id="${componentName}">
            `;
        }

        return defaultContainerExampleOpenRender(tokens, idx, options, env, self);
    };

    // :::
    const defaultContainerExampleCloseRender = md.renderer.rules.container_render_close!;
    md.renderer.rules.container_render_close = (tokens: Token[], idx: number, options: Options, env: any, self: Renderer): string => {
        const token = tokens[idx];

        if (token.nesting === -1) {
            return `
                </div>
            `;
        }

        return defaultContainerExampleCloseRender(tokens, idx, options, env, self);
    };
};

export default (md: MarkdownIt) => {
    directive(md);
    parseTag(md);
    parseContainer(md);
};
