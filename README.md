# YourBase VSCode Extension

This is the official VSCode extension for [YourBase][].

[YourBase]: https://yourbase.io/

## Features

- **Task Detection**: Workspaces with a [`.yourbase.yml` file][] will have
  [Tasks][] appear for each build target.

[`.yourbase.yml` file]: https://docs.yourbase.io/configuration/yourbase_yaml.html
[Tasks]: https://code.visualstudio.com/docs/editor/tasks

## Requirements

The `yb` CLI must be installed. See the [`yb` installation][] instructions for
details.

[`yb` installation]: https://github.com/yourbase/yb/blob/master/README.md#how-to-use-it

## Extension Settings

This extension contributes the following settings:

* `yourbase.remoteBuild`: Run builds on the YourBase service. Must log in using
  `yb login` first.
