// Caches cloned templates to avoid re-cloning
const templateCache = {};

/**
 * Finds the correct parent selection for appending new template instances.
 * @param {d3.Selection} currentSelection - The current D3 selection.
 * @param {string} templateName - The name of the template.
 * @returns {d3.Selection} The parent D3 selection.
 */
function _findParentForTemplate(currentSelection, templateName) {
  if (!currentSelection || currentSelection.empty()) {
    const templateNode = document.querySelector(`[data-template='${templateName}']`);
    return templateNode ? d3.select(templateNode.parentNode) : d3.select(null);
  }

  const childTemplatePlaceholder = currentSelection
    .node()
    .querySelector(`[data-template='${templateName}']`);
  return childTemplatePlaceholder
    ? d3.select(childTemplatePlaceholder.parentNode)
    : currentSelection;
}

/**
 * Populates a D3 selection with data based on 'data-text' and 'data-link' attributes.
 * @param {d3.Selection} selectionToUpdate - The D3 selection to populate.
 */
function _populateElementsWithData(selectionToUpdate) {
  selectionToUpdate.each(function (d) {
    const element = d3.select(this);
    for (const key in d) {
      if (d.hasOwnProperty(key) && !['children', 'name', 'key'].includes(key)) {
        // Handle text content
        const textTarget = element.select(`[data-text="${key}"]`);
        if (!textTarget.empty()) {
          textTarget.text(d[key]);
        } else if (element.attr('data-text') === key) {
          element.text(d[key]);
        }

        // Handle link href
        const linkTarget = element.select(`[data-link="${key}"]`);
        if (!linkTarget.empty()) {
          linkTarget.attr('href', d[key]);
        } else if (element.attr('data-link') === key) {
          element.attr('href', d[key]);
        }

        // Handle element id
        const idTarget = element.select(`[data-id="${key}"]`);
        if (!idTarget.empty()) {
          idTarget.attr('id', d[key]);
        } else if (element.attr('data-id') === key) {
          element.attr('id', d[key]);
        }

        // Handle element plugin
        const pluginTarget = element.select(`[data-plugin="${key}"]`);
        if (!pluginTarget.empty() && typeof window[d[key].name] === 'function') {
          const plugin = window[d[key].name]({
            d3selection: pluginTarget,
            settings: d[key].settings,
          });
          pluginTarget.node()['__plugin__'] = plugin;
        } else if (
          element.attr('data-plugin') === key &&
          typeof window[d[key].name] === 'function'
        ) {
          const plugin = window[d[key].name]({
            d3selection: pluginTarget,
            settings: d[key].settings,
          });
          element.node().__plugin__ = plugin;
        }

        // Handle  plugin update
        const pluginUpdateTarget = element.select(`[data-plugin-update="${key}"]`);
        if (
          !pluginUpdateTarget.empty() &&
          typeof pluginUpdateTarget.node()['__plugin__'] === 'function'
        ) {
          pluginUpdateTarget.node()['__plugin__'](d[key]);
        } else if (
          element.attr('data-plugin-update') === key &&
          typeof element.node()['__plugin__'] === 'function'
        ) {
          element.node()['__plugin__'](d[key]);
        }

        // Handle link triggered updates
        const updateLinkTarget = element.select(`[data-api="${key}"]`);
        if (!updateLinkTarget.empty()) {
          updateLinkTarget.on('click', async (e) => {
            e.preventDefault();
            const data = await d3.json(d[key]);
            window.build({ data });
            return false;
          });
        } else if (element.attr('data-api') === key) {
          element.on('click', async (e) => {
            e.preventDefault();
            const data = await d3.json(d[key]);
            window.build({ data });
            return false;
          });
        }
      }
    }
  });
}

/**
 * Gets a clean, cloned template element from the cache or the DOM.
 * @param {string} templateName - The name of the template.
 * @returns {HTMLElement|null} A cloned template element.
 */
function _getClonedTemplate(templateName) {
  if (!templateCache[templateName]) {
    const originalTemplate = document.querySelector(`[data-template='${templateName}']`);
    if (!originalTemplate) {
      console.warn(`Template with data-template='${templateName}' not found.`);
      return null;
    }
    templateCache[templateName] = originalTemplate.cloneNode(true);
  }
  return templateCache[templateName];
}

/**
 * Binds data to HTML templates using D3's join pattern.
 * @param {object} options - Options for the selection.
 * @param {Array|object} options.data - The data to bind.
 * @param {d3.Selection} options.selection - The current D3 selection.
 * @returns {d3.Selection} The merged D3 selection of updated and new elements.
 */
function _applyTemplateBinding({ data, selection }) {
  const dataToBind = Array.isArray(data) ? data : data ? [data] : [];
  const parentSelection = _findParentForTemplate(selection, dataToBind?.[0]?.name);
  const templateCSSSelector =
    !selection && dataToBind?.[0]?.id
      ? `#${dataToBind?.[0]?.id}`
      : [...new Set(dataToBind.map((d) => `[data-template='${d.name}']`))].join(',');

  const boundElements = parentSelection
    .selectAll(templateCSSSelector)
    .data(dataToBind, (d) => d?.key);

  const enterSelection = boundElements
    .enter()
    .append((d, i) => _getClonedTemplate(dataToBind?.[i]?.name).cloneNode(true))
    .attr('hidden', null)
    .classed('added', true)
    .classed('updated', false)
    .classed('removed', false);

  boundElements.classed('added', false).classed('updated', true).classed('removed', false);

  const mergedSelection = boundElements.merge(enterSelection);

  boundElements
    .exit()
    .attr('hidden', true)
    .classed('added', false)
    .classed('updated', false)
    .classed('removed', true)
    .remove();

  _populateElementsWithData(mergedSelection);

  return mergedSelection;
}

/**
 * Recursively builds the HTML structure based on the data and templates.
 * @param {object} options - Options for building.
 * @param {object|Array} options.data - The data to render.
 * @param {d3.Selection} [options.selection] - The current D3 selection (optional, for recursion).
 */
function build({ data, selection }) {
  if (!data && !selection) return;

  const newSelection = _applyTemplateBinding({
    data,
    selection,
  });

  newSelection.each(function (d) {
    const currentElement = d3.select(this);
    if (d.children && d.children.length > 0) {
      build({
        data: d.children,
        selection: currentElement,
      });
    } else {
      // Remove any child templates if there's no data for them
      currentElement.selectAll('[data-template]').remove();
    }
  });
}
