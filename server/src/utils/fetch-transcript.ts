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

const fetchTranscript = async (identifier: string): Promise<TranscriptData> => {
  console.log('Fetching Transcript - Calling fetchTranscript Utils');
  const { Innertube } = await import('youtubei.js');

  console.log('Creating YouTube instance');

  const youtube = await Innertube.create({
    lang: 'en',
    location: 'US',
    retrieve_player: false,
  });

  try {
    const info = await youtube.getInfo(identifier);
    const transcriptData = await info.getTranscript();

    console.log('Transcript data fetched');

    const transcriptWithTimeCodes: TranscriptSegment[] =
      transcriptData?.transcript?.content?.body?.initial_segments.map((segment) => {
        const segmentDuration = Number(segment.end_ms) - Number(segment.start_ms);
        return {
          text: segment.snippet.text,
          start: Number(segment.start_ms),
          end: Number(segment.end_ms),
          duration: segmentDuration,
        };
      });

    console.log('Transcript with time codes generated');

    function cleanImageUrl(url) {
      return url.split('?')[0];
    }

    console.log('Cleaning thumbnail URL');

    const fullTranscript = transcriptData?.transcript?.content?.body?.initial_segments
      .map((segment) => segment.snippet.text)
      .join(' ');

    console.log(fullTranscript, 'full transcript');

    console.log('Full transcript generated');

    console.log('Getting basic info');

    const title = info?.basic_info?.title;
    const videoId = info?.basic_info?.id;

    console.log('Getting thumbnail URL');

    const thumbnailUrl = info?.basic_info?.thumbnail[0]?.url;

    console.log("title", title);
    console.log("videoId", videoId);
    console.log("thumbnailUrl", thumbnailUrl);


    console.log('Returning transcript data');

    return {
      videoId,
      title: title || 'No title found',
      thumbnailUrl: thumbnailUrl ? cleanImageUrl(thumbnailUrl) : 'No video ID found',
      fullTranscript,
      transcriptWithTimeCodes,
    };
  } catch (error) {
    console.error('Error fetching transcript:', error);
    throw error;
  }
};

export default fetchTranscript;
