<p>
  <img width="100%" src="https://assets.solidjs.com/banner?type=@bigmistqke/solid-hex-editor&background=tiles&project=%20" alt="@bigmistqke/solid-hex-editor">
</p>

# @bigmistqke/solid-hex-editor

[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-cc00ff.svg?style=for-the-badge&logo=pnpm)](https://pnpm.io/)

minimal hex-editor



https://github.com/user-attachments/assets/88b8874d-63f7-4a2a-97d4-e504385deee4



## Quick start

Install it:

```bash
npm i @bigmistqke/solid-hex-editor
# or
yarn add @bigmistqke/solid-hex-editor
# or
pnpm add @bigmistqke/solid-hex-editor
```

Use it:

```tsx
import { HexEditor } from '@bigmistqke/solid-hex-editor'

const [array, setArray] = createSignal(
  new Uint8Array(Array.from({ length: 50 * 50 * 3 }, (_, i) => i % 255)),
  { equals: false },
)
render(
  () => (
    <HexEditor
      array={array()}
      onArrayUpdate={(index, value) => {
        setArray(array => {
          array[index] = value
          return array
        })
      }}
    />
  ),
  document.body,
)
```
