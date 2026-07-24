import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../shared/Icon';
import { useLibrary } from '../../hooks/useLibrary';
import { useTreeStore } from '../../store/tree.store';
import { useEditorStore } from '../../store/editor.store';
import { useLabels } from '../../hooks/useLabels';
import { addQuestionsToSet } from '../../api/hierarchy';
import type { IContent } from '../../types/content';
import { QUESTION_FILTERS } from '../../types/content';

// =============================================================================
// Helpers
// =============================================================================

/** Short type-badge text (e.g. "MCQ") from a primaryCategory string. */
function typeBadge(primaryCategory?: string): string {
  const cat = (primaryCategory ?? '').toLowerCase();
  if (cat.includes('multiple choice')) return 'MCQ';
  if (cat.includes('subjective')) return 'SA';
  if (cat.includes('fill in') || cat.includes('ftb')) return 'FTB';
  if (cat.includes('match')) return 'MTF';
  if (cat.includes('sequence')) return 'SEQ';
  if (cat.includes('reorder')) return 'REO';
  return 'Q';
}

/** "Science · Class 7" caption from subject/gradeLevel arrays. */
function metaLine(item: IContent): string {
  const subject = item.subject?.[0];
  const grade = item.gradeLevel?.[0];
  return [subject, grade].filter(Boolean).join(' · ');
}

// =============================================================================
// Toast — lightweight ephemeral notification
// =============================================================================

interface ToastMessage {
  id: number;
  text: string;
  kind: 'success' | 'error';
}

let toastIdCounter = 0;

function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const show = useCallback((text: string, kind: 'success' | 'error' = 'success') => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, text, kind }]);
    timersRef.current.push(
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2800),
    );
  }, []);

  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  return { toasts, show };
}

// =============================================================================
// LibraryDock
// =============================================================================

interface LibraryDockProps {
  onCollapse: () => void;
}

export function LibraryDock({ onCollapse }: LibraryDockProps) {
  const L = useLabels();
  const { content, isLoading, activeFilter, searchQuery, hasMore, search, setFilter, loadMore } =
    useLibrary();

  const selectedNodeId = useTreeStore((s) => s.selectedNodeId);
  const addExistingQuestion = useTreeStore((s) => s.addExistingQuestion);
  const getNodeById = useTreeStore((s) => s.getNodeById);
  const updateNode = useTreeStore((s) => s.updateNode);
  const editorMode = useEditorStore((s) => s.editorMode);
  const isReadOnly = editorMode !== 'edit';

  const { toasts, show: showToast } = useToast();

  const [inputValue, setInputValue] = useState(searchQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setInputValue(val);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => search(val), 300);
    },
    [search],
  );

  const handleClearSearch = useCallback(() => {
    setInputValue('');
    search('');
  }, [search]);

  const handleAdd = useCallback(
    async (item: IContent) => {
      // A question can only be added into a section, not another question.
      let targetId = selectedNodeId;
      if (targetId) {
        const node = getNodeById(targetId);
        if (node && !node.isFolder) targetId = node.parent ?? null;
      }
      if (!targetId) {
        showToast(L('messages.error.selectSection', 'Select a section to add the question to'), 'error');
        return;
      }

      // Link it into the local tree (old-editor semantics — nothing new is
      // created, the do_ id joins the hierarchy as-is).
      const result = addExistingQuestion(targetId, item as unknown as { identifier: string } & Record<string, unknown>);
      if (result === 'exists') {
        showToast(L('messages.error.alreadyInSet', 'This question is already in the set'), 'error');
        return;
      }
      if (!result) {
        showToast(L('messages.error.maxDepth', 'Cannot add here — maximum depth reached'), 'error');
        return;
      }

      const displayName = (item.name ?? 'Question').slice(0, 40);

      // Standalone (Default-visibility) questions must be attached via
      // questionset/v2/add — merely listing the id in the section's local
      // children is not enough to persist the link server-side. Skip when
      // the target section itself hasn't been saved yet (temp- id); the
      // next hierarchy save creates the section, and this question can be
      // re-added once it exists.
      if (!targetId.startsWith('temp-')) {
        const rootId = useTreeStore.getState().treeData[0]?.identifier;
        if (rootId) {
          try {
            await addQuestionsToSet(rootId, targetId, [result]);
            updateNode(result, { visibility: 'Default', attached: true });
          } catch (err) {
            console.error('[LibraryDock] attach failed, will retry on next save:', err);
            updateNode(result, { visibility: 'Default', attached: false });
          }
        }
      }

      showToast(L('messages.success.questionAdded', `"${displayName}" added`), 'success');
    },
    [selectedNodeId, getNodeById, addExistingQuestion, updateNode, showToast, L],
  );

  return (
    <>
      <div className="ce-lib-head">
        <Icon name="library" size={18} className="ico" />
        <span className="lbl">{L('ui.questionLibrary', 'Question Library')}</span>
        <button
          title={L('ui.collapse', 'Collapse')}
          onClick={onCollapse}
          aria-label={L('ui.collapseLibraryPanel', 'Collapse library panel')}
        >
          <Icon name="panel-right" size={17} />
        </button>
      </div>

      <div className="ce-lib-search">
        <div className="ce-lib-search-box">
          <Icon name="search" size={16} />
          <input
            type="search"
            placeholder={L('ui.searchLibrary', 'Search library…')}
            value={inputValue}
            onChange={handleSearchChange}
            aria-label={L('ui.searchLibrary', 'Search library')}
          />
          {inputValue && (
            <button
              type="button"
              className="ce-lib-search-clear"
              onClick={handleClearSearch}
              aria-label={L('ui.clearSearch', 'Clear search')}
            >
              <Icon name="x" size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="ce-lib-filters" aria-label={L('ui.filterByQuestionType', 'Filter by question type')}>
        {QUESTION_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`ce-lib-chip${activeFilter === f.value ? ' on' : ''}`}
            onClick={() => setFilter(f.value)}
            aria-pressed={activeFilter === f.value}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="ce-lib-scroll" role="list" aria-label={L('ui.questionList', 'Question list')}>
        {isLoading && content.length === 0 ? (
          <div className="ce-lib-loading" role="status">
            <span className="ce-spinner" style={{ width: 22, height: 22, borderWidth: 2 }} aria-hidden="true" />
            <span>{L('ui.loadingQuestions', 'Loading questions…')}</span>
          </div>
        ) : content.length === 0 ? (
          <p className="ce-lib-empty">
            {L('ui.noQuestionsFound', 'No questions found. Try a different search.')}
          </p>
        ) : (
          <>
            {content.map((item) => (
              <div key={item.identifier} className="ce-lib-item" role="listitem">
                <span className="ico"><Icon name="help" size={17} /></span>
                <div className="body">
                  <p className="nm">{item.name || L('ui.untitledQuestion', 'Untitled Question')}</p>
                  <div className="meta">
                    <span className="type-pill">{typeBadge(item.primaryCategory)}</span>
                    {metaLine(item) && <span className="sub">{metaLine(item)}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  className="add-btn"
                  disabled={isReadOnly}
                  onClick={() => void handleAdd(item)}
                  title={L('ui.addToQuestionSet', 'Add to question set')}
                  aria-label={`${L('ui.addToQuestionSet', 'Add to question set')}: ${item.name}`}
                >
                  <Icon name="plus" size={15} />
                </button>
              </div>
            ))}

            {hasMore && (
              <button
                type="button"
                className="ce-lib-loadmore"
                onClick={loadMore}
                disabled={isLoading}
                aria-label={L('ui.loadMoreQuestions', 'Load more questions')}
              >
                {isLoading ? L('ui.loading', 'Loading…') : L('ui.loadMore', 'Load more')}
              </button>
            )}
          </>
        )}
      </div>

      {toasts.length > 0 && (
        <div className="ce-lib-toast" aria-live="assertive" aria-atomic="true">
          {toasts.map((t) => (
            <div key={t.id} className={`t ${t.kind}`} role="alert">
              {t.text}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default LibraryDock;
