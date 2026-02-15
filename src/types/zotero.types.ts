export type ZoteroCreator = {
  creatorType: string
  firstName?: string
  lastName?: string
  name?: string
}

export type ZoteroItemData = {
  key: string
  itemType: string
  title: string
  creators: ZoteroCreator[]
  date: string
  abstractNote: string
  url?: string
  DOI?: string
  tags: { tag: string }[]
  collections: string[]
}

export type ZoteroItem = {
  key: string
  version: number
  library: {
    type: string
    id: number
    name: string
  }
  links?: {
    attachment?: {
      href: string
      type: string
      attachmentType?: string
      attachmentSize?: number
    }
  }
  data: ZoteroItemData
}

export type ZoteroAttachment = {
  key: string
  data: {
    key: string
    itemType: 'attachment'
    parentItem: string
    title: string
    filename?: string
    contentType?: string
    path?: string
    linkMode?: string
  }
}

export type ZoteroCollectionData = {
  key: string
  version: number
  name: string
  parentCollection: string | false
}

export type ZoteroCollection = {
  key: string
  version: number
  meta: {
    numCollections: number
    numItems: number
  }
  data: ZoteroCollectionData
}

export type CollectionTreeNode = {
  key: string
  name: string
  children: CollectionTreeNode[]
  itemCount: number
  path: string // vault-relative path e.g. "Library/PhD/Forecasting"
}

export type PaperMetadata = {
  zoteroKey: string
  itemType: string
  title: string
  authors: string[]
  year: string
  abstract: string
  pdfPath: string
  hasCitation: boolean
  collectionKeys: string[]
}
