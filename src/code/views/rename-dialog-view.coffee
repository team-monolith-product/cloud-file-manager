{createReactClass, createReactFactory} = require '../utils/react'
{div, input, a, button} = require 'react-dom-factories'

ModalDialog = createReactFactory require './modal-dialog-view'

tr = require '../utils/translate'

module.exports = createReactClass

  displayName: 'RenameDialogView'

  getInitialState: ->
    filename = @props.filename or ''
    state =
      filename: filename
      trimmedFilename: @trim filename

  componentDidMount: ->
    @filename = ReactDOM.findDOMNode @filenameRef
    @filename.focus()

  updateFilename: ->
    filename = @filename.value
    @setState
      filename: filename
      trimmedFilename: @trim filename

  trim: (s) ->
    s.replace /^\s+|\s+$/, ''

  rename: (e) ->
    if @state.trimmedFilename.length > 0
      @props.callback? @state.filename
      @props.close()
    else
      e.preventDefault()
      @filename.focus()

  render: ->
    (ModalDialog {title: (tr '~DIALOG.RENAME'), close: @props.close},
      (div {className: 'rename-dialog'},
        (input {ref: ((elt) => @filenameRef = elt), placeholder: 'Filename', value: @state.filename, onChange: @updateFilename})
        (div {className: 'buttons'},
          (button {className: (if @state.trimmedFilename.length is 0 then 'disabled' else ''), onClick: @rename}, tr '~RENAME_DIALOG.RENAME')
          (button {onClick: @props.close}, tr '~RENAME_DIALOG.CANCEL')
        )
      )
    )
