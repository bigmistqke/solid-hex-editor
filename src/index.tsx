import { Repeat } from '@solid-primitives/range'
import { batch, ComponentProps, JSX, splitProps } from 'solid-js'
import { unwrap } from 'solid-js/store'

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

type RangeVector = { start: number; end: number; anchor: number; focus: number }

function getSelection(element: HTMLElement): RangeVector {
  const selection = document.getSelection()

  if (!selection || selection.rangeCount === 0) {
    return { start: 0, end: 0, anchor: 0, focus: 0 }
  }

  const documentRange = selection.getRangeAt(0)

  // Create a range that spans from the start of the contenteditable to the selection start
  const elementRange = document.createRange()
  elementRange.selectNodeContents(element)
  elementRange.setEnd(documentRange.startContainer, documentRange.startOffset)

  // The length of the elementRange gives the start offset relative to the whole content
  const start = elementRange.toString().length
  const end = start + documentRange.toString().length

  const anchorRange = document.createRange()
  anchorRange.selectNodeContents(element)
  anchorRange.setEnd(selection.anchorNode!, selection.anchorOffset)

  const focusRange = document.createRange()
  focusRange.selectNodeContents(element)
  focusRange.setEnd(selection.focusNode!, selection.focusOffset)

  return {
    start,
    end,
    anchor: anchorRange.toString().length,
    focus: focusRange.toString().length,
  }
}

function select(element: HTMLElement, { anchor, focus }: { anchor: number; focus?: number }) {
  const selection = document.getSelection()!
  const range = document.createRange()
  selection.removeAllRanges()

  const resultAnchor = getNodeAndOffsetAtIndex(element, anchor)
  range.setStart(resultAnchor.node, resultAnchor.offset)
  range.setEnd(resultAnchor.node, resultAnchor.offset)
  selection.addRange(range)

  if (focus !== undefined) {
    const resultFocus = getNodeAndOffsetAtIndex(element, focus)
    selection.extend(resultFocus.node, resultFocus.offset)
  }
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
        cellSize={2}
        render={value => value.toString(16).padStart(2, '0').toUpperCase()}
        scrollToSelection={scrollToSelection}
        onPointerUp={event => {
          const selection = getSelection(event.currentTarget)

          const start = selection.anchor < selection.focus ? selection.anchor : selection.focus
          const end = selection.anchor > selection.focus ? selection.anchor : selection.focus

          if (floor(start, 2) !== floor(end, 2)) {
            select(event.currentTarget, {
              anchor:
                selection.anchor < selection.focus
                  ? floor(selection.anchor, 2)
                  : ceil(selection.anchor, 2),
              focus:
                selection.anchor > selection.focus
                  ? floor(selection.focus, 2)
                  : ceil(selection.focus, 2),
            })
          } else if (event.target instanceof HTMLElement) {
            select(event.target, { anchor: 0, focus: 2 })
          }
        }}
        onCopy={(event, selection) => {
          const array = unwrap(props.array).slice(
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
              anchor: index * 2,
              focus: index * 2 + data.length * 2,
            })
          }
        }}
        onDelete={(event, selection) => {
          batch(() => {
            for (
              let index = Math.floor(selection.start / 2);
              index < Math.ceil(selection.end / 2);
              index++
            ) {
              props.onArrayUpdate(index, 0)
            }
          })
          select(event.currentTarget, {
            anchor: selection.start,
            focus: selection.end,
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
        cellSize={1}
        array={props.array}
        render={value => (value > 32 && value < 127 ? String.fromCharCode(value) : '.')}
        scrollToSelection={scrollToSelection}
        onCopy={(event, selection) => {
          const array = unwrap(props.array).slice(
            Math.floor(selection.start),
            Math.ceil(selection.end),
          )
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
              anchor: index,
              focus: index + data.length * 1,
            })
          }
        }}
        onPointerUp={event => {
          const selection = getSelection(event.currentTarget)
          if (floor(selection.start, 2) !== ceil(selection.end, 2)) return
          if (event.target instanceof HTMLElement) {
            select(event.target, { anchor: 0, focus: 1 })
          }
        }}
        onDelete={(event, selection) => {
          batch(() => {
            for (let index = selection.start; index < selection.end; index++) {
              props.onArrayUpdate(index, 0)
            }
          })
          select(event.currentTarget, {
            anchor: selection.start,
            focus: selection.end,
          })
        }}
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

type GridEventHandler<T> = (
  event: T & { currentTarget: HTMLDivElement },
  selection: RangeVector,
) => void

function GridEditor(props: {
  array: Array<number> | Uint8Array
  cellSize: number
  render(value: number): string
  scrollToSelection(): void
  onCopy: GridEventHandler<ClipboardEvent>
  onPaste: GridEventHandler<ClipboardEvent>
  onDelete: GridEventHandler<InputEvent>
  onInsert: GridEventHandler<InputEvent>
  onPointerUp: GridEventHandler<PointerEvent>
}) {
  function onArrowLeft(
    event: KeyboardEvent & { currentTarget: HTMLDivElement },
    selection: RangeVector,
  ) {
    if (event.shiftKey) {
      const focus = floor(selection.focus, props.cellSize) - props.cellSize
      if (focus === selection.anchor) {
        select(event.currentTarget, {
          anchor: selection.focus,
          focus: focus - props.cellSize,
        })
      } else if (focus >= 0) {
        select(event.currentTarget, {
          anchor: selection.anchor,
          focus,
        })
      }
    } else {
      if (selection.anchor > selection.focus) {
        const focus = floor(selection.focus, props.cellSize) - props.cellSize

        if (focus >= 0) {
          select(event.currentTarget, {
            anchor: focus + props.cellSize,
            focus,
          })
        }
      } else {
        const anchor = floor(selection.anchor, props.cellSize) - props.cellSize
        if (anchor >= 0) {
          select(event.currentTarget, {
            focus: anchor + props.cellSize,
            anchor,
          })
        }
      }
    }
  }
  function onArrowRight(
    event: KeyboardEvent & { currentTarget: HTMLDivElement },
    selection: RangeVector,
  ) {
    if (event.shiftKey) {
      const focus = floor(selection.focus, props.cellSize) + props.cellSize

      if (focus === selection.anchor) {
        select(event.currentTarget, {
          anchor: selection.focus,
          focus: focus + props.cellSize,
        })
        return
      }

      if (focus <= props.array.length * props.cellSize) {
        select(event.currentTarget, {
          anchor: selection.anchor,
          focus,
        })
      }

      return
    }

    if (selection.anchor < selection.focus) {
      const focus = floor(selection.focus, props.cellSize) + props.cellSize
      console.log(focus, selection.anchor)
      select(event.currentTarget, {
        anchor: focus - props.cellSize,
        focus,
      })
      return
    }

    const anchor = floor(selection.anchor, props.cellSize) + props.cellSize
    if (anchor >= 0) {
      select(event.currentTarget, {
        focus: anchor - props.cellSize,
        anchor,
      })
    }
  }
  function onArrowUp(
    event: KeyboardEvent & { currentTarget: HTMLDivElement },
    selection: RangeVector,
  ) {
    if (event.shiftKey) {
      const focus = floor(selection.focus, props.cellSize) - 16 * props.cellSize

      const shouldFlip =
        (selection.anchor < selection.focus && selection.anchor > focus) ||
        (selection.anchor > selection.focus && selection.anchor < focus)

      if (focus <= props.array.length * props.cellSize) {
        select(event.currentTarget, {
          anchor: shouldFlip ? selection.anchor + props.cellSize : selection.anchor,
          focus: shouldFlip ? focus - props.cellSize : focus,
        })
      }

      return
    }

    select(event.currentTarget, {
      anchor: floor(selection.start - 16 * props.cellSize, props.cellSize),
      focus: floor(selection.start - 15 * props.cellSize, props.cellSize),
    })
  }
  function onArrowDown(
    event: KeyboardEvent & { currentTarget: HTMLDivElement },
    selection: RangeVector,
  ) {
    if (event.shiftKey) {
      const focus = floor(selection.focus, props.cellSize) + 16 * props.cellSize

      const shouldFlip =
        (selection.anchor < selection.focus && selection.anchor > focus) ||
        (selection.anchor > selection.focus && selection.anchor < focus)

      if (focus <= props.array.length * props.cellSize) {
        select(event.currentTarget, {
          anchor: shouldFlip ? selection.anchor - props.cellSize : selection.anchor,
          focus: shouldFlip ? focus + props.cellSize : focus,
        })
      }

      return
    }

    select(event.currentTarget, {
      anchor: floor(selection.end + 15 * props.cellSize, props.cellSize),
      focus: floor(selection.end + 16 * props.cellSize, props.cellSize),
    })
  }
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
            onArrowLeft(event, selection)
            props.scrollToSelection()
            break
          }
          case 'ArrowRight': {
            event.preventDefault()
            onArrowRight(event, selection)
            props.scrollToSelection()
            break
          }
          case 'ArrowUp': {
            event.preventDefault()
            onArrowUp(event, selection)
            props.scrollToSelection()
            break
          }
          case 'ArrowDown': {
            event.preventDefault()
            onArrowDown(event, selection)
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
            props.onDelete(e, selection)
          }
        }
      }}
    >
      <Repeat times={props.array.length}>
        {index => (
          <span data-inactive={props.array[index] === 0 ? true : undefined}>
            {props.render(props.array[index]!)}
          </span>
        )}
      </Repeat>
    </div>
  )
}
