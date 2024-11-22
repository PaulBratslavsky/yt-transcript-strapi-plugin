export interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
  duration: number;
}

export interface TranscriptData {
  videoId: string;
  fullTranscript: string;
  transcriptWithTimeCodes: TranscriptSegment[];
}

const fetchTranscript = async (videoId: string): Promise<TranscriptData> => {
  console.log('Fetching Transcript - Calling fetchTranscript Utils');
  const { Innertube } = await import('youtubei.js');

  console.log('Creating YouTube instance');

  const youtube = await Innertube.create({
    lang: 'en',
    location: 'US',
    retrieve_player: false,
  });

  try {
    const info = await youtube.getInfo(videoId);
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


    const fullTranscript = transcriptData?.transcript?.content?.body?.initial_segments
      .map((segment) => segment.snippet.text)
      .join(' ');

    console.log(fullTranscript, 'full transcript');
    console.log('Full transcript generated');
    console.log('Returning transcript data');

    return {
      videoId,
      fullTranscript,
      transcriptWithTimeCodes,
    };
  } catch (error) {
    console.error('Error fetching transcript:', error);
    throw error;
  }
};

export default fetchTranscript;
