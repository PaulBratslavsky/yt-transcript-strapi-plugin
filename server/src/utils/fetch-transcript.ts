export interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
  duration: number;
}

export interface TranscriptData {
  title: string;
  videoId: string;
  thumbnailUrl: string;
  fullTranscript: string;
  transcriptWithTimeCodes: TranscriptSegment[];
}

const fetchTranscript = async (
  identifier: string
): Promise<TranscriptData> => {
  const { Innertube } = await import('youtubei.js');

  const youtube = await Innertube.create({
    lang: 'en',
    location: 'US',
    retrieve_player: false,
  });

  try {
    const info = await youtube.getInfo(identifier);
    const transcriptData = await info.getTranscript();

    const transcriptWithTimeCodes: TranscriptSegment[] = transcriptData?.transcript?.content?.body?.initial_segments.map(
      (segment) => {
        const segmentDuration = Number(segment.end_ms) - Number(segment.start_ms);
        return {
          text: segment.snippet.text,
          start: Number(segment.start_ms),
          end: Number(segment.end_ms),
          duration: segmentDuration,
        };
      }
    );

    function cleanImageUrl(url) {
      return url.split('?')[0];
    }

    const fullTranscript = transcriptData?.transcript?.content?.body?.initial_segments.map(
      (segment) => segment.snippet.text
    ).join(' ');

    const title = info.basic_info.title;
    const videoId = info.basic_info.id;
    console.log(info.basic_info.thumbnail[0].url, "what is this");
    let thumbnailUrl = "";
    const processedThumbnailUrl = info.basic_info?.thumbnail?.[0]?.url;
    if (processedThumbnailUrl) {
      thumbnailUrl = cleanImageUrl(processedThumbnailUrl);
    } else {
      thumbnailUrl = "";
    }

    return {
      title,
      videoId,
      thumbnailUrl,
      fullTranscript,
      transcriptWithTimeCodes,
    };
  } catch (error) {
    console.error('Error fetching transcript:', error);
    throw error;
  }
};

export default fetchTranscript;