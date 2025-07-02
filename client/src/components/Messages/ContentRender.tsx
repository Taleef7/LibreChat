import { useRecoilValue } from 'recoil';
// Add useState to the react import
import { useCallback, useMemo, memo, useState, useEffect } from 'react';
import type { TMessage, TMessageContentParts, TSource } from 'librechat-data-provider';
import type { TMessageProps, TMessageIcon } from '~/common';
import ContentParts from '~/components/Chat/Messages/Content/ContentParts';
import PlaceholderRow from '~/components/Chat/Messages/ui/PlaceholderRow';
import SiblingSwitch from '~/components/Chat/Messages/SiblingSwitch';
import HoverButtons from '~/components/Chat/Messages/HoverButtons';
import MessageIcon from '~/components/Chat/Messages/MessageIcon';
import { useAttachments, useMessageActions } from '~/hooks';
import SubRow from '~/components/Chat/Messages/SubRow';
import { cn, logger } from '~/utils';
import store from '~/store';

type ContentRenderProps = {
  message?: TMessage;
  isCard?: boolean;
  isMultiMessage?: boolean;
  isSubmittingFamily?: boolean;
} & Pick<
  TMessageProps,
  'currentEditId' | 'setCurrentEditId' | 'siblingIdx' | 'setSiblingIdx' | 'siblingCount'
>;

// Helper type for our citation data
type Citation = {
  text: string;
  rerank_score?: number;
  metadata?: {
    source?: string;
  };
};

const ContentRender = memo(
  ({
    message: msg,
    isCard = false,
    siblingIdx,
    siblingCount,
    setSiblingIdx,
    currentEditId,
    isMultiMessage = false,
    setCurrentEditId,
    isSubmittingFamily = false,
  }: ContentRenderProps) => {
    // --- START: NEW CITATION STATE ---
    const [citations, setCitations] = useState<Citation[] | null>(null);
    // --- END: NEW CITATION STATE ---

    const { attachments, searchResults } = useAttachments({
      messageId: msg?.messageId,
      attachments: msg?.attachments,
    });
    const {
      edit,
      index,
      agent,
      assistant,
      enterEdit,
      conversation,
      messageLabel,
      isSubmitting,
      latestMessage,
      handleContinue,
      copyToClipboard,
      setLatestMessage,
      regenerateMessage,
      handleFeedback,
      // We need the raw stream data to check for our custom metadata
      stream,
    } = useMessageActions({
      message: msg,
      searchResults,
      currentEditId,
      isMultiMessage,
      setCurrentEditId,
    });

    // --- START: NEW CITATION EFFECT ---
    // This effect runs whenever the stream data changes
    useEffect(() => {
      if (stream && stream.length > 0) {
        // Look at the last chunk of the stream
        const lastChunk = stream[stream.length - 1];
        if (lastChunk.choices[0]?.delta?.custom_meta?.citations) {
          const newCitations = lastChunk.choices[0].delta.custom_meta.citations;
          logger.log('[Citations] Received citations:', newCitations);
          setCitations(newCitations);
        }
      }
    }, [stream]); // Dependency array ensures this runs when `stream` updates
    // --- END: NEW CITATION EFFECT ---

    const maximizeChatSpace = useRecoilValue(store.maximizeChatSpace);
    const fontSize = useRecoilValue(store.fontSize);

    const handleRegenerateMessage = useCallback(() => regenerateMessage(), [regenerateMessage]);
    const isLast = useMemo(
      () =>
        !(msg?.children?.length ?? 0) && (msg?.depth === latestMessage?.depth || msg?.depth === -1),
      [msg?.children, msg?.depth, latestMessage?.depth],
    );
    const isLatestMessage = msg?.messageId === latestMessage?.messageId;
    const showCardRender = isLast && !isSubmittingFamily && isCard;
    const isLatestCard = isCard && !isSubmittingFamily && isLatestMessage;

    const iconData: TMessageIcon = useMemo(
      () => ({
        endpoint: msg?.endpoint ?? conversation?.endpoint,
        model: msg?.model ?? conversation?.model,
        iconURL: msg?.iconURL,
        modelLabel: messageLabel,
        isCreatedByUser: msg?.isCreatedByUser,
      }),
      [
        messageLabel,
        conversation?.endpoint,
        conversation?.model,
        msg?.model,
        msg?.iconURL,
        msg?.endpoint,
        msg?.isCreatedByUser,
      ],
    );

    const clickHandler = useMemo(
      () =>
        showCardRender && !isLatestMessage
          ? () => {
              logger.log(`Message Card click: Setting ${msg?.messageId} as latest message`);
              logger.dir(msg);
              setLatestMessage(msg!);
            }
          : undefined,
      [showCardRender, isLatestMessage, msg, setLatestMessage],
    );

    if (!msg) {
      return null;
    }

    const baseClasses = {
      common: 'group mx-auto flex flex-1 gap-3 transition-all duration-300 transform-gpu ',
      card: 'relative w-full gap-1 rounded-lg border border-border-medium bg-surface-primary-alt p-2 md:w-1/2 md:gap-3 md:p-4',
      chat: maximizeChatSpace
        ? 'w-full max-w-full md:px-5 lg:px-1 xl:px-5'
        : 'md:max-w-[47rem] xl:max-w-[55rem]',
    };

    const conditionalClasses = {
      latestCard: isLatestCard ? 'bg-surface-secondary' : '',
      cardRender: showCardRender ? 'cursor-pointer transition-colors duration-300' : '',
      focus: 'focus:outline-none focus:ring-2 focus:ring-border-xheavy',
    };

    return (
      <div
        id={msg.messageId}
        aria-label={`message-${msg.depth}-${msg.messageId}`}
        className={cn(
          baseClasses.common,
          isCard ? baseClasses.card : baseClasses.chat,
          conditionalClasses.latestCard,
          conditionalClasses.cardRender,
          conditionalClasses.focus,
          'message-render',
        )}
        onClick={clickHandler}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && clickHandler) {
            clickHandler();
          }
        }}
        role={showCardRender ? 'button' : undefined}
        tabIndex={showCardRender ? 0 : undefined}
      >
        {isLatestCard && (
          <div className="absolute right-0 top-0 m-2 h-3 w-3 rounded-full bg-text-primary" />
        )}

        <div className="relative flex flex-shrink-0 flex-col items-center">
          <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
            <MessageIcon iconData={iconData} assistant={assistant} agent={agent} />
          </div>
        </div>

        <div
          className={cn(
            'relative flex w-11/12 flex-col',
            msg.isCreatedByUser ? 'user-turn' : 'agent-turn',
          )}
        >
          <h2 className={cn('select-none font-semibold', fontSize)}>{messageLabel}</h2>

          <div className="flex flex-col gap-1">
            <div className="flex max-w-full flex-grow flex-col gap-0">
              <ContentParts
                edit={edit}
                isLast={isLast}
                enterEdit={enterEdit}
                siblingIdx={siblingIdx}
                messageId={msg.messageId}
                attachments={attachments}
                isSubmitting={isSubmitting}
                searchResults={searchResults}
                setSiblingIdx={setSiblingIdx}
                isCreatedByUser={msg.isCreatedByUser}
                conversationId={conversation?.conversationId}
                content={msg.content as Array<TMessageContentParts | undefined>}
              />
              {/* --- START: NEW CITATION RENDER --- */}
              {citations && citations.length > 0 && (
                <div className="mt-4 w-full">
                  <div className="text-sm font-semibold mb-2 text-gray-400">Sources</div>
                  <div className="accordion-container">
                    {citations.map((citation, index) => (
                      <div key={index} className="accordion-item bg-gray-900/70 rounded-lg mb-2 border border-gray-700">
                        <details>
                          <summary className="p-2 cursor-pointer text-xs flex items-center">
                            <span className="font-mono text-xs p-1 bg-gray-700 rounded mr-2">
                              Score: {citation.rerank_score?.toFixed(4) ?? 'N/A'}
                            </span>
                            <span className="truncate">
                              Source {index + 1}: {citation.metadata?.source?.split('/').pop() ?? 'Unknown Source'}
                            </span>
                          </summary>
                          <div className="p-4 border-t border-gray-700">
                            <p className="text-gray-300 text-sm whitespace-pre-wrap font-mono">{citation.text}</p>
                          </div>
                        </details>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* --- END: NEW CITATION RENDER --- */}
            </div>

            {(isSubmittingFamily || isSubmitting) && !(msg.children?.length ?? 0) ? (
              <PlaceholderRow isCard={isCard} />
            ) : (
              <SubRow classes="text-xs">
                <SiblingSwitch
                  siblingIdx={siblingIdx}
                  siblingCount={siblingCount}
                  setSiblingIdx={setSiblingIdx}
                />
                <HoverButtons
                  index={index}
                  isEditing={edit}
                  message={msg}
                  enterEdit={enterEdit}
                  isSubmitting={isSubmitting}
                  conversation={conversation ?? null}
                  regenerate={handleRegenerateMessage}
                  copyToClipboard={copyToClipboard}
                  handleContinue={handleContinue}
                  latestMessage={latestMessage}
                  handleFeedback={handleFeedback}
                  isLast={isLast}
                />
              </SubRow>
            )}
          </div>
        </div>
      </div>
    );
  },
);

export default ContentRender;