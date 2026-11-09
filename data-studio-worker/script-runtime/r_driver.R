suppressPackageStartupMessages(library(jsonlite))
main <- function() {
  request <- fromJSON(paste(readLines(file("stdin"), warn=FALSE), collapse="\n"), simplifyVector=FALSE)
  logs <- character()
  result <- tryCatch({
    names_in <- unlist(request$columns, use.names=FALSE)
    columns <- lapply(seq_along(names_in), function(j) vapply(request$rows, function(row) if (is.null(row[[j]])) NA_character_ else as.character(row[[j]]), character(1)))
    names(columns) <- names_in
    input <- as.data.frame(columns, check.names=FALSE, stringsAsFactors=FALSE)
    environment <- new.env(parent=globalenv())
    environment$input <- input
    environment$df <- input
    # Console text is separate from the JSON result protocol.
    connection <- file('/work/r-console.log', open='wt')
    sink(connection); sink(connection, type='message')
    error <- NULL
    tryCatch(eval(parse(text=request$code, keep.source=FALSE), envir=environment), error=function(e) error <<- e)
    sink(type='message'); sink(); close(connection)
    logs <- tryCatch(readLines('/work/r-console.log', warn=FALSE), error=function(e) character())
    log_text <- substr(paste(tail(logs, 100), collapse='\n'), 1, 8192)
    if (!is.null(error)) return(list(success=FALSE, code='SCRIPT_EXECUTION_FAILED', detail=substr(conditionMessage(error), 1, 1000), logs=log_text))
    if (!exists('output', envir=environment, inherits=FALSE)) stop('SCRIPT_OUTPUT_REQUIRED')
    output <- get('output', envir=environment, inherits=FALSE)
    if (!is.data.frame(output)) stop('SCRIPT_OUTPUT_DATAFRAME_REQUIRED')
    if (ncol(output) < 1 || ncol(output) > 30 || any(nchar(names(output), type='chars') > 128) || any(trimws(names(output)) == '') || anyDuplicated(tolower(names(output)))) stop('SCRIPT_COLUMNS_INVALID')
    if (nrow(output) > 50) stop('SCRIPT_TOO_MANY_ROWS')
    normalized <- lapply(output, function(column) {
      if (is.factor(column)) return(as.character(column))
      if (inherits(column, 'Date')) return(format(column, '%Y-%m-%d'))
      if (inherits(column, 'POSIXt')) return(format(column, '%Y-%m-%dT%H:%M:%S', tz='UTC'))
      if (is.list(column) || !is.atomic(column)) stop('SCRIPT_CELL_INVALID')
      column
    })
    rows <- lapply(seq_len(nrow(output)), function(i) unname(lapply(normalized, function(column) {
      item <- column[[i]]
      if (length(item) != 1 || is.na(item) || (is.numeric(item) && !is.finite(item))) return(NULL)
      value <- if (is.logical(item)) if (item) 'true' else 'false' else as.character(item)
      if (nchar(value, type='chars') > 256) stop('SCRIPT_CELL_TOO_LARGE')
      value
    })))
    list(success=TRUE, data=list(columns=as.list(names(output)), rows=rows, logs=log_text))
  }, error=function(e) {
    message <- conditionMessage(e)
    if (startsWith(message, 'SCRIPT_')) list(success=FALSE, code=message) else list(success=FALSE, code='SCRIPT_EXECUTION_FAILED', detail=substr(message, 1, 1000))
  })
  result
}
cat(toJSON(main(), auto_unbox=TRUE, null='null', na='null', digits=17, force=TRUE))
