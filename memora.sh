# 1. Define your repository (CHANGE THIS TO YOUR ACTUAL REPO)
REPO="karthik445/memora"

# 2. Create the GitHub Project Board
echo "Creating GitHub Project Board..."
PROJECT_DATA=$(gh project create --owner "$(echo $REPO | cut -d'/' -f1)" --title "Memora MVP Roadmap")
echo "Project Board Created successfully!"

# 3. Create the High-Level Epic Tickets
echo "Generating High-Level Tickets..."

# Epic 1
gh issue create --repo "$REPO" \
  --title "EPIC: Microservice Infrastructure and Database Bootstrapping" \
  --label "epic" --label "backend" \
  --body "Setup the Monorepo structure containing Docker environments for PostgreSQL (pgvector), Redis, MinIO/S3, NestJS gateway, and Python AI containers.

### Sub-Tasks
- [ ] Configure Docker Compose setup for localized development services.
- [ ] Initialize database schemas for users, weddings, events, and photos.
- [ ] Deploy Next.js frontend scaffolding in a monorepo setup."

# Epic 2
gh issue create --repo "$REPO" \
  --title "EPIC: Media Upload Pipeline & Storage Strategy" \
  --label "epic" --label "backend" \
  --body "Implement robust, secure uploading of high-volume wedding image sets.

### Sub-Tasks
- [ ] Implement API endpoint 'POST /photos/upload' for managing mass photo files.
- [ ] Integrate Amazon S3/MinIO for raw images and generate low-weight WebP/AVIF thumbnails.
- [ ] Implement security measures using Signed URLs and expiring links for private galleries."

# Epic 3
gh issue create --repo "$REPO" \
  --title "EPIC: Image Pre-processing and AI Pipeline Engine" \
  --label "epic" \
  --body "Create asynchronous Python FastAPI jobs to clean, sort, and extract metadata from freshly uploaded sets based on the [Memora Platform Document](https://docs.google.com/document/d/1CLHo3CTiYkXfZQ5CJbbbLJTyNlkwh4JKU0Qn9u5uA3w/edit?tab=t.0).

### Sub-Tasks
- [ ] Develop OpenCV Laplacian variance microservice for Blur Detection.
- [ ] Wire up InsightFace model for face extraction and tracking.
- [ ] Implement CLIP embeddings + FAISS vector search to identify and remove near-identical duplicate shots."

# Epic 4
gh issue create --repo "$REPO" \
  --title "EPIC: High-Performance Smart Gallery UX" \
  --label "epic" --label "frontend" \
  --body "Build a highly visual UI layout prioritizing fluid emotional animations and handling 30,000+ items smoothly.

### Sub-Tasks
- [ ] Develop virtualized masonry/grid view utilizing 'react-photo-album'.
- [ ] Inject Framer Motion slow-inertia and shared layout transitions.
- [ ] Introduce keyboard navigation ('F' to Favorite, 'M' to Must-Have, 'Space' for Fullscreen).
- [ ] Build mobile-first gesture support (pinch zoom, swipe-to-select)."

# Epic 5
gh issue create --repo "$REPO" \
  --title "EPIC: Realtime Shared Selection Workspace (Phase 2)" \
  --label "epic" --label "frontend" --label "backend" \
  --body "Enable multi-user collaborative workspaces with real-time status syncing for families and photographers.

### Sub-Tasks
- [ ] Establish WebSocket gateway connection ('WS /presence') via Socket.io.
- [ ] Build live indicator components ('Bride viewing', 'Photographer reviewing').
- [ ] Develop real-time comment threads ('POST /photos/:id/comments') and reaction triggers."

echo "🎉 All tasks successfully created on GitHub!"