function Get-PortableShellEntryNames {
  param([Parameter(Mandatory = $true)][AllowEmptyCollection()][object[]]$Items)
  foreach ($item in $Items) {
    # FolderItem.Name is a localized display label and may hide extensions.
    [IO.Path]::GetFileName(([string]$item.Path).TrimEnd('\', '/'))
  }
}
