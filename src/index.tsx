import { Repeat } from '@solid-primitives/range'
import { batch, ComponentProps, JSX, splitProps } from 'solid-js'

function getNodeAndOffsetAtIndex(element: Node, index: number) {
  const nodes = element.childNodes

  let accumulator = 0

  // Determine which node contains the selection-(start|end)
  for (const node of nodes) {
    const contentLength = node.textContent?.length || 0

    accumulator += contentLength

    if (accumulator >= index) {
      const offset = index - (accumulator - contentLength)
      if (node instanceof Text) {
        return {
          node,
          offset,
        }
      }
      return getNodeAndOffsetAtIndex(node, offset)
    }
  }

  throw `Could not find node`
}

type RangeVector = { start: number; end: number }
function getSelection(element: HTMLElement): RangeVector {
  const selection = document.getSelection()

  if (!selection || selection.rangeCount === 0) {
    return { start: 0, end: 0 }
  }

  const documentRange = selection.getRangeAt(0)

  // Create a range that spans from the start of the contenteditable to the selection start
  const elementRange = document.createRange()
  elementRange.selectNodeContents(element)
  elementRange.setEnd(documentRange.startContainer, documentRange.startOffset)

  // The length of the elementRange gives the start offset relative to the whole content
  const start = elementRange.toString().length
  const end = start + documentRange.toString().length
  return { start, end }
}

function select(element: HTMLElement, { start, end }: { start: number; end?: number }) {
  const selection = document.getSelection()!
  const range = document.createRange()
  selection.removeAllRanges()

  const resultStart = getNodeAndOffsetAtIndex(element, start)
  range.setStart(resultStart.node, resultStart.offset)

  if (end) {
    const resultEnd = getNodeAndOffsetAtIndex(element, end)
    range.setEnd(resultEnd.node, resultEnd.offset)
  } else {
    range.setEnd(resultStart.node, resultStart.offset)
  }

  selection.addRange(range)
}

const hexValues = Array.from({ length: 16 }, (_, i) => i.toString(16))
const isHex = (char: string | undefined) => char && hexValues.includes(char)
const isAscii = (char: unknown): char is string => {
  if (typeof char !== 'string') return false
  const charCode = char.charCodeAt(0)
  return charCode > 32 && charCode < 127
}

function floor(value: number, floor: number) {
  return Math.floor(value / floor) * floor
}
function ceil(value: number, ceil: number) {
  return Math.ceil(value / ceil) * ceil
}

export function HexEditor(
  props: Omit<ComponentProps<'div'>, 'style'> & {
    style?: JSX.CSSProperties
    array: Array<number> | Uint8Array
    onArrayUpdate(index: number, value: number): void
  },
) {
  const [, rest] = splitProps(props, ['style', 'array', 'onArrayUpdate'])
  let container: HTMLDivElement = null!

  function scrollToSelection() {
    const selection = window.getSelection()
    if (!selection?.rangeCount) return

    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()

    if (rect.top < containerRect.top) {
      container.scrollTop += rect.top - containerRect.top - containerRect.height / 4
    } else if (rect.bottom > containerRect.bottom) {
      container.scrollTop += rect.bottom - containerRect.bottom + containerRect.height / 4
    }
  }

  return (
    <div
      ref={container!}
      style={{
        padding: '10px',
        overflow: 'auto',
        display: 'grid',
        'grid-template-columns': 'auto 1fr auto',
        ...props.style,
      }}
      {...rest}
    >
      <div
        style={{
          display: 'grid',
          'grid-template-rows': `repeat(${props.array.length / 16}, 1fr)`,
        }}
      >
        <Repeat times={Math.ceil(props.array.length / 16)}>
          {index => <span>{(index * 16).toString(16).padStart(8, '0')}</span>}
        </Repeat>
      </div>
      <GridEditor
        array={props.array}
        render={value => value.toString(16).padStart(2, '0').toUpperCase()}
        scrollToSelection={scrollToSelection}
        onPointerUp={event => {
          const selection = getSelection(event.currentTarget)
          if (floor(selection.start, 2) !== ceil(selection.end, 2)) {
            select(event.currentTarget, {
              start: floor(selection.start, 2),
              end: ceil(selection.end, 2),
            })
            return
          }
          if (event.target instanceof HTMLElement) {
            select(event.target, { start: 0, end: 2 })
          }
        }}
        onCopy={(event, selection) => {
          const array = props.array.slice(
            Math.floor(selection.start / 2),
            Math.ceil(selection.end / 2),
          )
          event.clipboardData!.setData('text/json', JSON.stringify(Array.from(array)))
        }}
        onPaste={(event, selection) => {
          const index = Math.floor(selection.start / 2)
          const data = JSON.parse(event.clipboardData!.getData('text/json'))
          if (Array.isArray(data)) {
            batch(() => {
              data.forEach((value, offset) => {
                props.onArrayUpdate(index + offset, value)
              })
            })
            select(event.currentTarget, {
              start: index * 2,
              end: index * 2 + data.length * 2,
            })
          }
        }}
        onDelete={(event, selection) => {
          const index = Math.floor(selection.start / 2)
          props.onArrayUpdate(index, 0)
          select(event.currentTarget, {
            start: selection.start,
            end: selection.end,
          })
        }}
        onInsert={(event, selection) => {
          const data = event.data?.toLowerCase()

          if (!isHex(data)) return

          const offset = selection.start % 2
          const index = Math.floor(selection.start / 2)
          const hex = props.array[index]!.toString(16).padStart(2, '0')

          props.onArrayUpdate(
            index,
            parseInt(offset === 0 ? data + hex.slice(1) : hex.slice(0, 1) + data, 16),
          )

          if (floor(selection.start + 1, 2) === selection.start) {
            select(event.currentTarget, {
              start: selection.start + 1,
              end: selection.start + 2,
            })
          } else {
            select(event.currentTarget, {
              start: selection.start + 1,
              end: selection.start + 3,
            })
          }
        }}
        onArrowLeft={(event, selection) => {
          const start = floor(selection.start, 2) - 2
          if (start >= 0) {
            select(event.currentTarget, {
              start,
              end: start + 2,
            })
          }
        }}
        onArrowRight={(event, selection) => {
          const end = floor(selection.end, 2) + 2
          if (end <= props.array.length * 2) {
            select(event.currentTarget, {
              start: end - 2,
              end,
            })
          }
        }}
        onArrowUp={(event, selection) => {
          const start = floor(selection.start, 2) - 16 * 2
          if (start > 0) {
            select(event.currentTarget, {
              start,
              end: start + 2,
            })
          }
        }}
        onArrowDown={(event, selection) => {
          const end = floor(selection.end, 2) + 16 * 2
          if (end <= props.array.length * 2) {
            select(event.currentTarget, {
              start: end - 2,
              end,
            })
          }
        }}
      />
      <GridEditor
        array={props.array}
        render={value => (value > 32 && value < 127 ? String.fromCharCode(value) : '.')}
        scrollToSelection={scrollToSelection}
        onCopy={(event, selection) => {
          const array = props.array.slice(Math.floor(selection.start), Math.ceil(selection.end))
          event.clipboardData!.setData('text/json', JSON.stringify(Array.from(array)))
        }}
        onPaste={(event, selection) => {
          const index = Math.floor(selection.start)
          const data = JSON.parse(event.clipboardData!.getData('text/json'))
          if (Array.isArray(data)) {
            batch(() => {
              data.forEach((value, offset) => {
                props.onArrayUpdate(index + offset, value)
              })
            })
            select(event.currentTarget, {
              start: index,
              end: index + data.length * 1,
            })
          }
        }}
        onPointerUp={event => {
          const selection = getSelection(event.currentTarget)
          if (floor(selection.start, 2) !== ceil(selection.end, 2)) return
          if (event.target instanceof HTMLElement) {
            select(event.target, { start: 0, end: 1 })
          }
        }}
        onDelete={(event, selection) => {
          const index = Math.floor(selection.start)
          props.onArrayUpdate(index, 0)
          select(event.currentTarget, {
            start: selection.start,
            end: selection.start + 1,
          })
        }}
        onInsert={(event, selection) => {
          if (isAscii(event.data)) {
            const index = Math.floor(selection.start)
            props.onArrayUpdate(index, event.data.charCodeAt(0))
            select(event.currentTarget, {
              start: selection.start + 1,
              end: selection.start + 2,
            })
          }
        }}
        onArrowLeft={(event, selection) => {
          const start = selection.start - 1
          if (start >= 0) {
            select(event.currentTarget, {
              start,
              end: selection.start,
            })
          }
        }}
        onArrowRight={(event, selection) => {
          const end = selection.end + 1
          if (end <= props.array.length) {
            select(event.currentTarget, {
              start: end - 1,
              end,
            })
          }
        }}
        onArrowUp={(event, selection) => {
          const start = selection.start - 16
          if (start >= 0) {
            select(event.currentTarget, {
              start,
              end: start + 1,
            })
          }
        }}
        onArrowDown={(event, selection) => {
          const end = selection.end + 16
          if (end <= props.array.length) {
            select(event.currentTarget, {
              end,
              start: end - 1,
            })
          }
        }}
      />
    </div>
  )
}

function GridEditor(props: {
  array: Array<number> | Uint8Array
  render(value: number): string
  scrollToSelection(): void
  onArrowUp(event: KeyboardEvent & { currentTarget: HTMLDivElement }, selection: RangeVector): void
  onArrowDown(
    event: KeyboardEvent & { currentTarget: HTMLDivElement },
    selection: RangeVector,
  ): void
  onArrowLeft(
    event: KeyboardEvent & { currentTarget: HTMLDivElement },
    selection: RangeVector,
  ): void
  onArrowRight(
    event: KeyboardEvent & { currentTarget: HTMLDivElement },
    selection: RangeVector,
  ): void
  onInsert(event: InputEvent & { currentTarget: HTMLDivElement }, selection: RangeVector): void
  onDelete(event: InputEvent & { currentTarget: HTMLDivElement }, selection: RangeVector): void
  onCopy(event: ClipboardEvent & { currentTarget: HTMLDivElement }, selection: RangeVector): void
  onPaste(event: ClipboardEvent & { currentTarget: HTMLDivElement }, selection: RangeVector): void
  onPointerUp(event: PointerEvent & { currentTarget: HTMLDivElement }, selection: RangeVector): void
}) {
  return (
    <div
      style={{
        display: 'grid',
        'grid-template-columns': 'repeat(16, 1fr)',
        'user-select': 'none',
      }}
      contentEditable
      onPointerUp={event => {
        const selection = getSelection(event.currentTarget)
        props.onPointerUp(event, selection)
      }}
      onCopy={event => {
        event.preventDefault()
        const selection = getSelection(event.currentTarget)
        props.onCopy(event, selection)
      }}
      onPaste={event => {
        const selection = getSelection(event.currentTarget)
        props.onPaste(event, selection)
      }}
      onKeyDown={event => {
        const selection = getSelection(event.currentTarget)
        switch (event.code) {
          case 'ArrowLeft': {
            event.preventDefault()
            props.onArrowLeft(event, selection)
            break
          }
          case 'ArrowRight': {
            event.preventDefault()
            props.onArrowRight(event, selection)
            break
          }
          case 'ArrowUp': {
            event.preventDefault()
            props.onArrowUp(event, selection)
            break
          }
          case 'ArrowDown': {
            event.preventDefault()
            props.onArrowDown(event, selection)
            break
          }
        }
        props.scrollToSelection()
      }}
      onBeforeInput={e => {
        e.preventDefault()
        const selection = getSelection(e.currentTarget)
        switch (e.inputType) {
          case 'insertText': {
            props.onInsert(e, selection)
            break
          }
          case 'deleteContentBackward': {
            props.onDelete(e, selection)
          }
        }
      }}
    >
      <Repeat times={props.array.length}>
        {index => <span>{props.render(props.array[index]!)}</span>}
      </Repeat>
    </div>
  )
}
