import { Repeat } from '@solid-primitives/range'
import { batch, ComponentProps, createMemo, JSX, splitProps } from 'solid-js'
import { unwrap } from 'solid-js/store'

interface SelectionOffsets {
  start: number
  end: number
  anchor: number
  focus: number
}

function getSelection(element: HTMLElement): SelectionOffsets {
  const selection = document.getSelection()

  if (!selection || selection.rangeCount === 0) {
    return { start: 0, end: 0, anchor: 0, focus: 0 }
  }

  const range = document.createRange()
  range.selectNodeContents(element)
  range.setEnd(selection.anchorNode!, selection.anchorOffset)
  const anchor = range.toString().length

  range.setEnd(selection.focusNode!, selection.focusOffset)
  const focus = range.toString().length

  return {
    start: anchor < focus ? anchor : focus,
    end: anchor > focus ? anchor : focus,
    anchor,
    focus,
  }
}

function select(element: HTMLElement, { anchor, focus }: { anchor: number; focus?: number }) {
  const selection = document.getSelection()!
  const range = document.createRange()

  const resultAnchor = getNodeAndOffsetAtIndex(element, anchor)
  range.setStart(resultAnchor.node, resultAnchor.offset)
  range.setEnd(resultAnchor.node, resultAnchor.offset)

  selection.empty()
  selection.addRange(range)

  if (focus !== undefined) {
    const resultFocus = getNodeAndOffsetAtIndex(element, focus)
    selection.extend(resultFocus.node, resultFocus.offset)
  }
}

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

const hexValues = Array.from({ length: 16 }, (_, i) => i.toString(16))
const isHex = (char: string | undefined) => char && hexValues.includes(char)
const isAscii = (char: unknown): char is string => {
  if (typeof char !== 'string') return false
  const charCode = char.charCodeAt(0)
  return charCode > 32 && charCode < 127
}

function floorSnap(value: number, floor: number) {
  return Math.floor(value / floor) * floor
}
function ceilSnap(value: number, ceil: number) {
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

  const offsetCharCount = createMemo(() => ceilSnap(props.array.length, 16).toString(16).length)

  return (
    <div
      ref={container!}
      style={{
        overflow: 'auto',
        display: 'grid',
        'grid-template-columns': 'auto 1fr auto',
        ...props.style,
      }}
      {...rest}
    >
      <div
        data-grid="offset"
        style={{
          display: 'grid',
          'grid-template-rows': `repeat(${props.array.length / 16}, 1fr)`,
        }}
      >
        <Repeat times={Math.ceil(props.array.length / 16)}>
          {index => (
            <span data-cell>{(index * 16).toString(16).padStart(offsetCharCount(), '0')}</span>
          )}
        </Repeat>
      </div>
      <GridEditor
        name="hex"
        cellSize={2}
        array={props.array}
        onArrayUpdate={props.onArrayUpdate}
        render={value => value.toString(16).padStart(2, '0').toUpperCase()}
        scrollToSelection={scrollToSelection}
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

          if (floorSnap(selection.start + 1, 2) === selection.start) {
            select(event.currentTarget, {
              anchor: selection.start + 1,
              focus: selection.start + 2,
            })
          } else {
            select(event.currentTarget, {
              anchor: selection.start + 1,
              focus: selection.start + 3,
            })
          }
        }}
      />
      <GridEditor
        name="ascii"
        cellSize={1}
        array={props.array}
        onArrayUpdate={props.onArrayUpdate}
        render={value => (value > 32 && value < 127 ? String.fromCharCode(value) : '.')}
        scrollToSelection={scrollToSelection}
        onInsert={(event, selection) => {
          if (isAscii(event.data)) {
            const index = Math.floor(selection.start)
            props.onArrayUpdate(index, event.data.charCodeAt(0))
            select(event.currentTarget, {
              anchor: selection.start + 1,
              focus: selection.start + 2,
            })
          }
        }}
      />
    </div>
  )
}

function GridEditor(props: {
  name: string
  cellSize: number
  array: Array<number> | Uint8Array
  onArrayUpdate(index: number, value: number): void
  onInsert(event: InputEvent & { currentTarget: HTMLDivElement }, selection: SelectionOffsets): void
  render(value: number): string
  scrollToSelection(): void
}) {
  function onArrowHorizontal(
    event: KeyboardEvent & { currentTarget: HTMLDivElement },
    selection: SelectionOffsets,
    direction: 1 | -1,
  ) {
    if (event.shiftKey) {
      const focus = floorSnap(selection.focus, props.cellSize) + props.cellSize * direction

      if (focus === selection.anchor) {
        select(event.currentTarget, {
          anchor: selection.focus,
          focus: focus + props.cellSize * direction,
        })
        return
      }

      const withinBounds =
        direction === -1 ? focus >= 0 : focus <= props.array.length * props.cellSize

      if (withinBounds) {
        select(event.currentTarget, {
          anchor: selection.anchor,
          focus,
        })
      }

      return
    }

    if (direction === -1) {
      const start = floorSnap(selection.start, props.cellSize) - props.cellSize
      if (start >= 0) {
        select(event.currentTarget, {
          anchor: start,
          focus: start + props.cellSize,
        })
      }
    } else {
      const end = floorSnap(selection.end, props.cellSize) + props.cellSize
      if (end <= props.array.length * props.cellSize) {
        select(event.currentTarget, {
          anchor: end - props.cellSize,
          focus: end,
        })
      }
    }
  }

  function onArrowVertical(
    event: KeyboardEvent & { currentTarget: HTMLDivElement },
    selection: SelectionOffsets,
    direction: -1 | 1,
  ) {
    if (event.shiftKey) {
      const focus = floorSnap(selection.focus, props.cellSize) + 16 * props.cellSize * direction

      const shouldFlip =
        (selection.anchor < selection.focus && selection.anchor > focus) ||
        (selection.anchor > selection.focus && selection.anchor < focus)

      const withinBounds =
        direction === -1 ? focus >= 0 : focus <= props.array.length * props.cellSize

      if (withinBounds) {
        select(event.currentTarget, {
          anchor: shouldFlip ? selection.anchor - props.cellSize * direction : selection.anchor,
          focus: shouldFlip ? focus + props.cellSize * direction : focus,
        })
      }

      return
    }

    if (direction === -1) {
      const anchor = floorSnap(selection.start - 16 * props.cellSize, props.cellSize)
      if (anchor > 0) {
        select(event.currentTarget, {
          anchor: anchor,
          focus: anchor + props.cellSize,
        })
      }
    } else {
      const focus = floorSnap(selection.end + 16 * props.cellSize, props.cellSize)
      if (focus < props.array.length * props.cellSize) {
        select(event.currentTarget, {
          anchor: focus - props.cellSize,
          focus: focus,
        })
      }
    }
  }

  return (
    <div
      data-grid={props.name}
      style={{
        display: 'grid',
        'grid-template-columns': 'repeat(16, 1fr)',
        'user-select': 'none',
      }}
      contentEditable
      onPointerUp={event => {
        const selection = getSelection(event.currentTarget)

        const start = selection.anchor < selection.focus ? selection.anchor : selection.focus
        const end = selection.anchor > selection.focus ? selection.anchor : selection.focus

        if (floorSnap(start, props.cellSize) !== floorSnap(end, props.cellSize)) {
          select(event.currentTarget, {
            anchor:
              selection.anchor < selection.focus
                ? floorSnap(selection.anchor, props.cellSize)
                : ceilSnap(selection.anchor, props.cellSize),
            focus:
              selection.anchor > selection.focus
                ? floorSnap(selection.focus, props.cellSize)
                : ceilSnap(selection.focus, props.cellSize),
          })
        } else if (event.target instanceof HTMLElement) {
          select(event.target, { anchor: 0, focus: props.cellSize })
        }
      }}
      onCopy={event => {
        event.preventDefault()
        const selection = getSelection(event.currentTarget)
        const array = unwrap(props.array).slice(
          Math.floor(selection.start / props.cellSize),
          Math.ceil(selection.end / props.cellSize),
        )
        event.clipboardData!.setData('text/json', JSON.stringify(Array.from(array)))
      }}
      onPaste={event => {
        const selection = getSelection(event.currentTarget)
        const index = Math.floor(selection.start / props.cellSize)
        const data = JSON.parse(event.clipboardData!.getData('text/json'))
        if (Array.isArray(data)) {
          batch(() => {
            data.forEach((value, offset) => {
              props.onArrayUpdate(index + offset, value)
            })
          })
          select(event.currentTarget, {
            anchor: index * props.cellSize,
            focus: index * props.cellSize + data.length * props.cellSize,
          })
        }
      }}
      onKeyDown={event => {
        const selection = getSelection(event.currentTarget)
        switch (event.code) {
          case 'ArrowLeft': {
            event.preventDefault()
            onArrowHorizontal(event, selection, -1)
            props.scrollToSelection()
            break
          }
          case 'ArrowRight': {
            event.preventDefault()
            onArrowHorizontal(event, selection, 1)
            props.scrollToSelection()
            break
          }
          case 'ArrowUp': {
            event.preventDefault()
            onArrowVertical(event, selection, -1)
            props.scrollToSelection()
            break
          }
          case 'ArrowDown': {
            event.preventDefault()
            onArrowVertical(event, selection, 1)
            props.scrollToSelection()
            break
          }
        }
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
            batch(() => {
              for (
                let index = Math.floor(selection.start / props.cellSize);
                index < Math.ceil(selection.end / props.cellSize);
                index++
              ) {
                props.onArrayUpdate(index, 0)
              }
            })
            select(e.currentTarget, {
              anchor: selection.start,
              focus: selection.end,
            })
          }
        }
      }}
    >
      <Repeat times={props.array.length}>
        {index => (
          <span data-cell data-inactive={props.array[index] === 0 ? '' : undefined}>
            {props.render(props.array[index]!)}
          </span>
        )}
      </Repeat>
    </div>
  )
}
