import { useUIStore } from '../../stores/uiStore'
import { Modal } from '../ui/Modal'
import { VideoPlayer } from './VideoPlayer'

export function VideoModal() {
  const { videoModal, closeVideoModal } = useUIStore()

  if (!videoModal.isOpen || !videoModal.filePath) return null

  return (
    <Modal isOpen={videoModal.isOpen} onClose={closeVideoModal}>
      <VideoPlayer
        filePath={videoModal.filePath}
        mediaType={videoModal.mediaType || 'video'}
      />
    </Modal>
  )
}
