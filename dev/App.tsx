import { Repeat } from '@solid-primitives/range'
import { createSignal, type Component } from 'solid-js'
import { HexEditor } from 'src'
import styles from './App.module.css'

const App: Component = () => {
  const [array, setArray] = createSignal(
    new Uint8Array(Array.from({ length: 50 * 50 * 3 }, (_, i) => i % 255)),
    { equals: false },
  )
  return (
    <div class={styles.app}>
      <div class={styles.canvas}>
        <Repeat times={array().length / 3}>
          {index => (
            <span
              style={{
                background: `rgb(${array()[index * 3]}, ${array()[index * 3 + 1]}, ${
                  array()[index * 3 + 2]
                })`,
              }}
            />
          )}
        </Repeat>
      </div>
      <HexEditor
        class={styles.editor}
        array={array()}
        onArrayUpdate={(index, value) => {
          setArray(array => {
            array[index] = value
            return array
          })
        }}
      />
    </div>
  )
}

export default App
