import {
  FileIcon,
  FileTextIcon,
  FolderClosedIcon,
  FoldersIcon,
  ImageIcon,
  LinkIcon,
  TypeIcon,
} from 'lucide-react'

import { Mentionable } from '../../../../types/mentionable'

export const getMentionableIcon = (mentionable: Mentionable) => {
  switch (mentionable.type) {
    case 'file':
      return FileIcon
    case 'folder':
      return FolderClosedIcon
    case 'vault':
      return FoldersIcon
    case 'current-file':
      return FileIcon
    case 'block':
      return FileIcon
    case 'url':
      return LinkIcon
    case 'image':
      return ImageIcon
    case 'pdf':
      return FileTextIcon
    case 'pdf-text':
      return TypeIcon
    default:
      return null
  }
}
