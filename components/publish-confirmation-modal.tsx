"use client"

import React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Globe, Zap, CheckCircle, Loader2 } from "lucide-react"

interface Note {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: Date
  lastModified: Date
}

interface PublishConfirmationModalProps {
  note: Note
  onConfirm: () => void
  onCancel: () => void
  isLoading?: boolean
}

export default function PublishConfirmationModal({ 
  note, 
  onConfirm, 
  onCancel,
  isLoading = false
}: PublishConfirmationModalProps) {
  return (
    <Dialog open={true} onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-[#F7931A]" />
            Publish to Nostr
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Warning message */}
          <div className="p-4 bg-[#F7931A]/10 rounded-lg border border-[#F7931A]/20">
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-[#F7931A] mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-zinc-100 mb-1">
                  Public Post Warning
                </h4>
                <p className="text-sm text-zinc-200">
                  This will publish your note as a <strong>public Kind 1 post</strong> to the Nostr network. 
                  Anyone can read it, and it will appear in your public feed.
                </p>
              </div>
            </div>
          </div>
          
          {/* Note preview */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Content Preview (as Kind 1 post):</h4>
            <div className="p-3 bg-[#1a1a1a] rounded-lg border border-zinc-800">
              <div className="text-sm text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed max-h-32 overflow-y-auto">
                {note.content}
              </div>
              {note.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {note.tags.map((tag, index) => (
                    <span 
                      key={index}
                      className="px-2 py-1 bg-[#F7931A]/10 text-[#F7931A] text-xs rounded border border-[#F7931A]/20"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Action buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              onClick={onCancel}
              variant="outline"
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={onConfirm}
              disabled={isLoading}
              className="flex-1 bg-[#F7931A] hover:bg-[#E8850F] text-black disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              {isLoading ? "Publishing..." : "Publish to Nostr"}
            </Button>
          </div>
          
          {/* Additional info */}
          <div className="text-xs text-zinc-500 text-center">
            Your note will be published as a Kind 1 event to Nostr relays
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
