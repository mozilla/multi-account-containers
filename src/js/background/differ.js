/*
  Original version: https://github.com/kpdecker/jsdiff
  This version is simplified for the usecase:
   - comparison of arrays
   - synchronous function call
   - equality of elements can be detected via the "===" operator
*/
/*
Software License Agreement (BSD License)

Copyright (c) 2009-2015, Kevin Decker <kpdecker@gmail.com>

All rights reserved.

Redistribution and use of this software in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above
  copyright notice, this list of conditions and the
  following disclaimer.

* Redistributions in binary form must reproduce the above
  copyright notice, this list of conditions and the
  following disclaimer in the documentation and/or other
  materials provided with the distribution.

* Neither the name of Kevin Decker nor the names of its
  contributors may be used to endorse or promote products
  derived from this software without specific prior
  written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR
IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR
CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER
IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT
OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

const differ = { // eslint-disable-line no-unused-vars
  diff(oldValues, newValues) {
    oldValues = oldValues.slice();
    newValues = newValues.slice();

    const newLen = newValues.length, oldLen = oldValues.length;
    let editLength = 1;
    const maxEditLength = newLen + oldLen;
    const bestPath = [{ newPos: -1, components: [] }];

    // Seed editLength = 0, i.e. the content starts with the same values
    const oldPos = this.extractCommon(bestPath[0], newValues, oldValues, 0);
    if (bestPath[0].newPos + 1 >= newLen && oldPos + 1 >= oldLen) {
      // Identity per the equality
      return [{value: newValues, count: newValues.length}];
    }

    // Main worker method. checks all permutations of a given edit length for acceptance.
    function execEditLength() {
      for (let diagonalPath = -1 * editLength; diagonalPath <= editLength; diagonalPath += 2) {
        let basePath;
        const addPath = bestPath[diagonalPath - 1];
        const removePath = bestPath[diagonalPath + 1];
        let oldPos = (removePath ? removePath.newPos : 0) - diagonalPath;
        if (addPath) {
          // No one else is going to attempt to use this value, clear it
          bestPath[diagonalPath - 1] = undefined;
        }

        const canAdd = addPath && addPath.newPos + 1 < newLen;
        const canRemove = removePath && 0 <= oldPos && oldPos < oldLen;
        if (!canAdd && !canRemove) {
          // If this path is a terminal then prune
          bestPath[diagonalPath] = undefined;
          continue;
        }

        // Select the diagonal that we want to branch from. We select the prior
        // path whose position in the new string is the farthest from the origin
        // and does not pass the bounds of the diff graph
        if (!canAdd || (canRemove && addPath.newPos < removePath.newPos)) {
          basePath = this._clonePath(removePath);
          this.pushComponent(basePath.components, undefined, true);
        } else {
          basePath = addPath; // No need to clone, we've pulled it from the list
          basePath.newPos++;
          this.pushComponent(basePath.components, true, undefined);
        }

        oldPos = this.extractCommon(basePath, newValues, oldValues, diagonalPath);

        // If we have hit the end of both strings, then we are done
        if (basePath.newPos + 1 >= newLen && oldPos + 1 >= oldLen) {
          return this._buildValues(basePath.components, newValues, oldValues, this.useLongestToken);
        } else {
          // Otherwise track this path as a potential candidate and continue.
          bestPath[diagonalPath] = basePath;
        }
      }

      editLength++;
    }

    while (editLength <= maxEditLength) {
      const ret = execEditLength.call(this);
      if (ret) {
        return ret;
      }
    }
  },

  pushComponent(components, added, removed) {
    const last = components[components.length - 1];
    if (last && last.added === added && last.removed === removed) {
      // We need to clone here as the component clone operation is just
      // as shallow array clone
      components[components.length - 1] = {count: last.count + 1, added: added, removed: removed };
    } else {
      components.push({count: 1, added: added, removed: removed });
    }
  },
  extractCommon(basePath, newValues, oldValues, diagonalPath) {
    const newLen = newValues.length;
    const oldLen = oldValues.length;
    let newPos = basePath.newPos;
    let oldPos = newPos - diagonalPath;

    let commonCount = 0;
    while (newPos + 1 < newLen && oldPos + 1 < oldLen && newValues[newPos + 1] === oldValues[oldPos + 1]) {
      newPos++;
      oldPos++;
      commonCount++;
    }

    if (commonCount) {
      basePath.components.push({count: commonCount});
    }

    basePath.newPos = newPos;
    return oldPos;
  },

  _buildValues(components, newValues, oldValues, useLongestToken) {
    let componentPos = 0;
    const componentLen = components.length;
    let newPos = 0;
    let oldPos = 0;

    for (; componentPos < componentLen; componentPos++) {
      const component = components[componentPos];
      if (!component.removed) {
        if (!component.added && useLongestToken) {
          let value = newValues.slice(newPos, newPos + component.count);
          value = value.map(function(value, i) {
            const oldValue = oldValues[oldPos + i];
            return oldValue.length > value.length ? oldValue : value;
          });

          component.value = value;
        } else {
          component.value = newValues.slice(newPos, newPos + component.count);
        }
        newPos += component.count;

        // Common case
        if (!component.added) {
          oldPos += component.count;
        }
      } else {
        component.value = oldValues.slice(oldPos, oldPos + component.count);
        oldPos += component.count;

        // Reverse add and remove so removes are output first to match common convention
        // The diffing algorithm is tied to add then remove output and this is the simplest
        // route to get the desired output with minimal overhead.
        if (componentPos && components[componentPos - 1].added) {
          const tmp = components[componentPos - 1];
          components[componentPos - 1] = components[componentPos];
          components[componentPos] = tmp;
        }
      }
    }

    return components;
  },

  _clonePath(path) {
    return { newPos: path.newPos, components: path.components.slice(0) };
  }
};
