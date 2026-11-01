// Reproductor clásico de YouTube, sin videos sugeridos de otros canales al terminar.
export const youtubeEmbedUrl = (videoId: string) =>
  `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&playsinline=1`;

export const YOUTUBE_ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
