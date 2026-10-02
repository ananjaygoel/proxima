// Normalised shapes for the two sources. Whatever scraper produced the data,
// the agent only ever sees these.

export type LinkedInExperience = {
  title: string;
  company: string;
  start?: string | null;
  end?: string | null;
  duration?: string | null;
  location?: string | null;
  description?: string | null;
  employmentType?: string | null;
};

export type LinkedInEducation = {
  school: string;
  degree?: string | null;
  field?: string | null;
  start?: string | null;
  end?: string | null;
};

export type LinkedInPost = {
  text: string;
  date?: string | null;
  likes?: number | null;
  comments?: number | null;
  isRepost?: boolean;
};

export type LinkedInData = {
  url: string;
  publicId: string;
  name: string;
  headline: string | null;
  about: string | null;
  location: string | null;
  photoUrl: string | null;
  followers: number | null;
  connections: number | null;
  openToWork: boolean | null;
  experience: LinkedInExperience[];
  education: LinkedInEducation[];
  skills: string[];
  certifications: string[];
  languages: string[];
  volunteering: string[];
  projects: string[];
  publications: string[];
  honors: string[];
  posts: LinkedInPost[];
};

export type InstagramPost = {
  index: number; // position used in refs: ig:post:<index>
  shortCode: string | null;
  url: string | null;
  type: string | null; // Image | Video | Sidecar
  caption: string | null;
  hashtags: string[];
  mentions: string[];
  location: string | null;
  timestamp: string | null;
  likes: number | null;
  comments: number | null;
  imageUrl: string | null;
  alt: string | null;
  isPinned: boolean;
  carouselCount: number;
  imageId?: string | null; // our stored copy
};

export type InstagramData = {
  url: string;
  username: string;
  fullName: string | null;
  bio: string | null;
  externalUrl: string | null;
  followers: number | null;
  following: number | null;
  postsCount: number | null;
  verified: boolean;
  isBusiness: boolean;
  category: string | null;
  isPrivate: boolean;
  profilePicUrl: string | null;
  profilePicImageId?: string | null;
  posts: InstagramPost[];
};

export type PersonStatus = "queued" | "scraping" | "reading" | "ready" | "dating" | "done" | "error" | "excluded";

export type PersonRow = {
  id: string;
  cohort: "demo" | "guest";
  status: PersonStatus;
  stage_detail: string | null;
  error: string | null;
  linkedin_url: string;
  linkedin_id: string;
  instagram_url: string;
  instagram_username: string;
  name: string | null;
  headline: string | null;
  city: string | null;
  photo_image_id: string | null;
  creator_token: string | null;
  consent: boolean;
  synthetic: boolean;
  created_at: string;
  updated_at: string;
};
