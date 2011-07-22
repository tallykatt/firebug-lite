/* See license.txt for terms of usage */

define(["BrowserDetection", "Measure"], function(BrowserDetection, Measure){

// ************************************************************************************************

/*
  xxxpedro notes:
  
    - position:absolute/fixed support?
        - what happens if we have a element with fixed position inside the flexBox?
        - what happens if a fixed position element is a flexBox, like a scrollable file selector?
  
    - Organize CSS in UI components
        - toolbar
        - splitter
        - overlay
        - scrollable
            - stopPropagation of mouse scroll events if reached top/bottom
            - auto css clip:rect() when there's no native scrollbar (custom scrollable components)
            - custom buttons
            - touch devices support
    
    - tweak UI
        - toolbar 26px
        - remove all borders from iframes/textarea
        - borders in splitters
        - bottom side panel toolbar at the top
  
// ************************************************************************************************
  
    - flexBox dependencies
        - className
        - event (onresize, onunload)
        - BrowserDetection
        - lazyExecution
        - Measure
            - BrowserDetection
        
    - move to chrome/context?
        - lazy
        - event
        - cache?
    
    - scrolling
        - getPosition - relative to what?
        - scrolling in-browser iframe Chrome different computation than Splitter

*/

// ************************************************************************************************

// TODO: is it possible to use native CSS3 flexbox? If it is not, then we should remove this option
// turning debugging on makes CSS3-flexBox-supported browsers to use FlexBox class to resize
// the elements via JavaScript instead of CSS, allowing the FlexBox functions to be debugabe
var debug = false;

// setting debugSplitterFrame to true will make the SplitterFrame element to be visible
// (the invisible element used to cover the whole UI when dragging the splitter in 
// order to capture mouse events)
var debugSplitterFrame = false;

//************************************************************************************************

// debug can also be enabled via URL hash like #debug or #iframe,debug
debug = debug === true ? true : /\bdebug\b/.test(document.location.hash);

//************************************************************************************************

// FIXME: xxxpedro: better browser detection? always use flexBox?
var supportsFlexBox = !document.all && !window.opera;
var isIE6 = BrowserDetection.IE6;

// ************************************************************************************************
// FlexBox Class constructor

function FlexBox(root, listenWindowResize)
{
    var win = root.contentWindow || window;

    this.measure = new Measure(win);

    this.boxObjects = [];

    this.root = root;

    initializeSplitters(this);

    if (supportsFlexBox && !debug)
    {
        this.reflow();
        return;
    }

    setClass(root, "boxFix");

    var self = this;

    this.render = function()
    {
        renderBoxes(this);
    };

    var resizeHandler = this.resizeHandler = isIE6 ?
            // IE6 requires an special resizeHandler to make the rendering smoother
            lazyExecution(self.render, self) :
            // Other browsers can handle
            (function(){ self.render(); });

    if (listenWindowResize)
    {
        var onunload = function()
        {
            removeEvent(win, "resize", resizeHandler);
            removeEvent(win, "unload", onunload);

            self.destroy();
        };

        addEvent(win, "resize", resizeHandler);
        addEvent(win, "unload", onunload);
    }

    self.invalidate();

    if (isIE6)
    {
        fixIE6BackgroundImageCache();
        setTimeout(function delayedFlexBoxReflow(){
            self.invalidate();
        }, 50);
    }
}

//************************************************************************************************
//FlexBox Class members

FlexBox.prototype.boxObjects = null;

FlexBox.prototype.reflow = function()
{
    var root = this.root;

    var object =
    {
        element : root,
        flex : null,
        extra : {}
    };

    this.boxObjects = [ object ];

    reflowBoxes(this);
};

FlexBox.prototype.render = function()
{

};

FlexBox.prototype.invalidate = function()
{
    this.reflow();
    this.render();
};

FlexBox.prototype.resizeHandler = function()
{
};

FlexBox.prototype.destroy = function()
{
    function cleanObject(object)
    {
        delete object.element;
        delete object.extra;
        delete object.orientation;
        delete object.children;
        delete object.layout;
    }
    
    this.root = null;

    var boxObjects = this.boxObjects;
    var boxObject;

    while (boxObject = boxObjects.pop())
    {
        var childBoxObject;
        var children = boxObject.children;
        
        while (childBoxObject = children.pop())
        {
            cleanObject(childBoxObject);
            childBoxObject = null;
        }
        
        cleanObject(boxObject);
        boxObject = null;
        children = null;
    }

    this.boxObjects = null;
};

//************************************************************************************************
// FlexBox helpers

FlexBox.prototype.getBoxOrientation = function(element)
{
    var orient = (element.className.match(/\b(v|h)box\b/) || [ 0, 0 ])[1];

    var type = orient == "v" ? "vertical" : orient == "h" ? "horizontal" : null;

    var orientation = null;

    if (type == "vertical")
    {
        orientation =
        {
            isVertical: true,
            dimension: "height",
            offset: "offsetHeight",
            before: "top",
            after: "bottom",
            mousePosition: "clientY"
        };
    }
    else if (type == "horizontal")
    {
        orientation =
        {
            isHorizontal: true,
            dimension: "width",
            offset: "offsetWidth",
            before: "left",
            after: "right",
            mousePosition: "clientX"
        };
    }

    return orientation;
};

FlexBox.prototype.getBoxObject = function(element)
{
    var boxObject;
    var boxObjects = this.boxObjects;
    
    for (var i = 0; boxObject = boxObjects[i]; i++)
    {
        if (boxObject.element == element)
            return boxObject;
    }

    return null;
};

FlexBox.prototype.getParentBoxObject = function(element)
{
    do
    {
        element = element.parentNode;
    }
    while (element && element.nodeType == 1 && !this.getBoxOrientation(element));
    
    return this.getBoxObject(element);
};

FlexBox.prototype.getChildObject = function(element, boxObject)
{
    var childObject;
    var boxObjectFound = false;
    
    if (this.getBoxOrientation(element))
    {
        return this.getBoxObject(element);
    }
    
    if (!boxObject)
    {
        boxObject = this.getBoxObject(element, true);
    }
    
    if (!boxObject) return null;

    for (var i = 0, children = boxObject.children; childObject = children[i]; i++)
    {
        if (childObject.element == element)
        {
            boxObjectFound = true;
            break;
        }
    }
    
    return boxObjectFound ? childObject : null;
};

//************************************************************************************************
// IE quirks mode hack

/*
// TODO: describe HTML panel scrollbar bug (appears only when manual resizing)

// TODO: describe text selection bug
document.body.onmouseleave = function(event) 
{
    event.returnValue = false;
    event.cancelBubble = true;    
};

// TODO: describe scroll bug
document.body.onscroll = function(event) 
{
    document.body.scrollLeft = document.body.scrollTop = 0;
};
*/

//************************************************************************************************
// Splitter

var splitters = [];

function initializeSplitters(flexBox)
{
    var doc = flexBox.root.ownerDocument;
    var elements = flexBox.root.getElementsByTagName("div");
    var element;

    for (var i = 0, l = elements.length; i < l; i++)
    {
        element = elements[i];
        if (hasClass(element, "fbSplitter"))
        {
            var targetId = element.getAttribute("data-target");
            var spacerId = element.getAttribute("data-spacer");

            var target = doc.getElementById(targetId);
            var spacer = doc.getElementById(spacerId);

            splitters.push(new Splitter(flexBox, element, target, spacer));
        }
    }
}

function Splitter(flexBox, splitter, target, spacer)
{
    this.flexBox = flexBox;

    this.splitter = splitter;
    this.target = target;
    this.spacer = spacer;

    this.document = splitter.ownerDocument;
    this.window = this.document.parentWindow || this.document.defaultView;

    this.splitterFrame = this.document.createElement("div");
    this.splitterFrame.className = "splitterFrame";

    var self = this;

    splitter.onmousedown = function(event)
    {
        self.onSplitterMouseDown(event);
    };
};

Splitter.prototype.onSplitterMouseDown = function(e)
{
    cancelEvent(e, true);

    var flexBox = this.flexBox;
    var splitterFrame = this.splitterFrame;

    var root = flexBox.root;
    var measure = flexBox.measure;

    var winSize = measure.getWindowSize();
    var target = this.target;
    var self = this;
    
    var orientation = flexBox.getParentBoxObject(target).orientation;
    var halfSplitterSize = Math.floor(this.splitter[orientation.offset]/2);

    openSplitterFrame(this, orientation);

    this.splitterFrame.onmousemove = function(event)
    {
        event = window.event || event;
        cancelEvent(event, true);

        var boxObject = flexBox.getParentBoxObject(target);
        var orientation = boxObject.orientation;
        
        var fixedSpace = boxObject.layout.accumulatedMinimumSpace;
        var targetSize = target[orientation.offset];
        var maxSize = boxObject.element[orientation.offset] + targetSize - fixedSpace;
        
        var targetBoxObject = flexBox.getBoxObject(target);
        var minSize = targetBoxObject ? targetBoxObject.layout.accumulatedMinimumSpace : 0;
        
        var mousePosition = event[orientation.mousePosition];

        var targetPosition = flexBox.measure.getElementPosition(target);
        var positionDiff = mousePosition - targetPosition[orientation.before] + halfSplitterSize;
        
        var size = targetSize - positionDiff;
        size = Math.min(maxSize, size);
        size = Math.max(minSize, size);
        target.style[orientation.dimension] = size + "px";

        if (isIE6)
        {
            var className = target.className;
            target.className = className + " boxFixIgnoreContents";
            flexBox.invalidate();
            target.className = className;
            // TODO: investigate the real source of this problem
            // xxxpedro not sure why but sometimes the UI will be rendered incorrectly here.
            // To reproduce, comment out the following line, then open the HTML Panel, and
            // make the Bottom Panel visible with the Command Editor visible too. Then, 
            // resize the Bottom Panel. You'll see that the whole LargeCommandLinePane will
            // be positioned in the wrong place.
            flexBox.invalidate();
        }
        else
            flexBox.invalidate();
    };

    this.splitterFrame.onmouseup = function(event)
    {
        function cancelSplitter(){
            try
            {
                self.splitter.focus();
            }
            catch (E) {}

            closeSplitterFrame(self);
        }

        event = window.event || event;
        cancelEvent(event, true);

        if (BrowserDetection.IE == 9)
            // IE9 need this timeout otherwise the mouse cursor image will freeze 
            // until the document is clicked again
            setTimeout(cancelSplitter,0);
        else
            // For other browsers we are not using setTimeout to avoid the problem when you 
            // release the mouse button and the target still resize for a small fraction of time
            cancelSplitter();
    };
};

function openSplitterFrame(splitter, orientation)
{
    var flexBox = splitter.flexBox;
    var root = flexBox.root;
    var splitterFrame = splitter.splitterFrame;
    
    var box = flexBox.measure.getElementBox(root);
    for (var prop in box)
    {
        splitterFrame.style[prop] = box[prop] + "px";
    }

    if (debugSplitterFrame)
    {
        splitterFrame.style.background = "#def";
        splitterFrame.style.opacity = 0.5;
        
        if (isIE6)
            splitterFrame.style.filter = "alpha(opacity=50)";
    }

    splitterFrame.style.cursor = orientation.isVertical ? "n-resize" : "e-resize";

    root.parentNode.insertBefore(splitterFrame, root);
}

function closeSplitterFrame(splitter)
{
    var root = splitter.flexBox.root;
    var splitterFrame = splitter.splitterFrame;

    splitterFrame.style.cursor = "inherit";

    root.parentNode.removeChild(splitterFrame);
}

//************************************************************************************************
// lazy execution

function lazyExecution(_function, _this, _arguments)
{
    var executionTimer;
    var lastExecution = 0;
    var thisObject = _this ? _this : _function.prototype ? _function.prototype : _function;
    
    _arguments = _arguments || [];

    return function()
    {
        if (new Date().getTime() - lastExecution > 50)
        {
            if (executionTimer)
            {
                clearTimeout(executionTimer);
                executionTimer = null;
            }

            _function.apply(thisObject, _arguments);

            lastExecution = new Date().getTime();
        }
        else
        {
            if (executionTimer)
            {
                clearTimeout(executionTimer);
                executionTimer = null;
            }

            executionTimer = setTimeout(function delayedExecution()
            {
                _function.apply(thisObject, _arguments);
            }, 50);
        }
    };
}

//* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

function reflowBoxes(flexBox)
{
    var boxObject;
    var childBoxObject;
    var childElement;

    var flex;
    var space;
    var boxSpace;
    var extraSpace;
    var padding;
    var border;

    var match;

    var measure = flexBox.measure;
    var boxObjects = flexBox.boxObjects;

    for (var index = 0; boxObject = boxObjects[index]; index++)
    {
        var parentElement = boxObject.element;

        var orientation = flexBox.getBoxOrientation(parentElement);
        if (!orientation)
            continue;

        var children = [];
        var layout = {};

        var flexSum = 0;
        var fixedSpace = 0;
        var minimumSpace = 0;

        for (var i = 0, childs = parentElement.childNodes, length = childs.length; i < length; i++)
        {
            childElement = childs[i];

            // ignore non-element nodes
            if (childElement.nodeType != 1)
                continue;

            // ignore non-visible elements too, otherwise we will reserve a space for
            // an element which will not be displayed
            if (measure.getStyle(childElement, "display") == "none") continue;

            padding = measure.getMeasureBox(childElement, "padding");
            border = measure.getMeasureBox(childElement, "border");

            extraSpace = padding[orientation.before] + padding[orientation.after] + 
                    border[orientation.before] + border[orientation.after];

            if (match = /\bboxFlex(\d?)\b/.exec(childElement.className))
            {
                flex = match[1] - 0 || 1;
                space = null;

                flexSum += flex;
                minimumSpace += extraSpace;
            }
            else
            {
                boxSpace = childElement[orientation.offset];

                space = boxSpace - extraSpace;
                space = Math.max(space, 0);

                flex = null;

                fixedSpace += boxSpace;
                minimumSpace += boxSpace;
            }

            childBoxObject =
            {
                element : childElement,
                flex : flex,
                extra : {},
                layout : layout
            };

            childBoxObject[orientation.dimension] = space;
            childBoxObject.extra[orientation.dimension] = extraSpace;

            children.push(childBoxObject);

            // if it is a box, then we need to layout it
            if (flexBox.getBoxOrientation(childElement))
            {
                boxObjects.push(childBoxObject);
            }
        }

        layout.flexSum = flexSum;
        layout.minimumSpace = minimumSpace;
        layout.accumulatedMinimumSpace = 0;
        layout.fixedSpace = fixedSpace;

        boxObject.orientation = orientation;
        boxObject.children = children;
        boxObject.layout = layout;

        // Now we must calculate the accumulated minimum space used for boxes with the same
        // orientation (horizontal or vertical). For instance, if a vertical box contains 
        // other vertical elements and the sum of their dimensions (their height in this case)
        // is greater than the dimension of the box itself, 
        do
        {
            boxObject = flexBox.getParentBoxObject(parentElement);
            if (boxObject)
            {
                if (boxObject.orientation.isVertical == orientation.isVertical)
                {
                    boxObject.layout.accumulatedMinimumSpace = Math.max(
                            boxObject.layout.accumulatedMinimumSpace, 
                            boxObject.layout.minimumSpace + minimumSpace
                        );
                }
                parentElement = boxObject.element;
            }
        }
        while(boxObject);
    }
}

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

function renderBoxes(flexBox)
{
    var boxObject;
    var childBoxObject;
    var childElement;
    
    var flex;
    var space;
    var boxSpace;
    var extraSpace;
    var padding;
    var border;

    var totalSpace;
    var freeSpace;

    var _isIE6 = isIE6;
    var measure = flexBox.measure;
    var boxObjects = flexBox.boxObjects;

    // render each box, followed by its children
    for (var index = 0; boxObject = boxObjects[index]; index++)
    {
        var computedSpace = 0;
        var remainingPixels = 0;

        // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
        // restore data from the boxObjects cache

        var parentElement = boxObject.element;
        var children = boxObject.children;
        var orientation = flexBox.getBoxOrientation(parentElement);
        
        var flexSum = boxObject.layout.flexSum;
        var fixedSpace = boxObject.layout.fixedSpace;
        var minimumSpace = boxObject.layout.minimumSpace;

        // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
        // calculating the total space

        extraSpace = boxObject.extra[orientation.dimension];
        if (!extraSpace)
        {
            padding = measure.getMeasureBox(parentElement, "padding");
            border = measure.getMeasureBox(parentElement, "border");

            extraSpace = padding[orientation.before] + padding[orientation.after] + 
                    border[orientation.before] + border[orientation.after];
        }

        // We are setting the height of horizontal boxes in IE6, so we need to 
        // temporary hide the elements otherwise we will get the wrong measures
        if (_isIE6)
        {
            var className = parentElement.className;
            parentElement.className = className + " boxFixIgnoreContents";
            space = parentElement[orientation.offset];
            parentElement.className = className;
        }
        else
        {
            space = parentElement[orientation.offset];
        }

        totalSpace = space - extraSpace;

        freeSpace = totalSpace - fixedSpace;

        // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
        // processing box children

        for (var i = 0, length = children.length; i < length; i++)
        {
            childBoxObject = children[i];

            childElement = childBoxObject.element;
            flex = childBoxObject.flex;
            extraSpace = childBoxObject.extra[orientation.dimension];

            // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
            // calculating child size

            // if it is a flexible child, then we need to calculate its space
            if (flex)
            {
                // calculate the base flexible space
                space = Math.floor(freeSpace * flex / flexSum);
                space -= extraSpace;
                space = Math.max(space, 0);

                // calculate the remaining pixels
                remainingPixels = freeSpace * flex % flexSum;

                // distribute remaining pixels
                if (remainingPixels > 0 && computedSpace + space + remainingPixels <= totalSpace)
                {
                    // distribute a proportion of the remaining pixels, or a minimum of 1 pixel
                    space += Math.floor(remainingPixels * flex / flexSum) || 1;
                }

                // save the value
                childBoxObject[orientation.dimension] = space;
            }
            // if it is not a flexible child, then we already have its dimension calculated
            else
            {
                // use the value calculated at the last reflow() operation
                space = childBoxObject[orientation.dimension];
            }

            // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
            // resizing child if necessary

            // If space equals to zero, then we must skip resizing the childElement, otherwise the
            // element will be resized to zero when not visible. This means that if we hide the 
            // Side Panel, the next time we try to display it, FlexBox won't be able to render it
            // properly because it will discover the dimension (width or height) of the box using 
            // its current value, and once the zero was applied to an inline style, that's the 
            // value it will get. A more cohesive approach would be detecting whether or not the
            // element has a "display:none" or "visibility:hidden", but we're trying to avoid
            // an extra computation to make the rendering process faster and we already are
            // calculating the space value, so we're using it here.
            if (space && (orientation.isHorizontal || flex))
            {
                if (orientation.isVertical)
                {
                    // if it's a child of a vertical box, then we only need to adjust the height...
                    childElement.style.height = space + "px";

                    // unless...

                    // xxxpedro 100% width of an iframe with border will exceed the width of 
                    // its offsetParent... don't ask me why. not sure though if this 
                    // is the best way to solve it
                    if (childElement.nodeName.toLowerCase() == "iframe" || 
                        // This same problem occurs in IE6 for "textarea" elements
                        //
                        // TODO: xxxpedro investigate of the overall problem with borders.
                        // It seems that this problem happens also in Firefox on any boxes.
                        // If this is true, we must rethink our strategy for borders, and
                        // users should avoid setting borders on boxes, using a wrapper
                        // to do that.
                        //
                        // Need to test if the problem with iframes and textareas persists
                        // when using a wrapper
                        /* _isIE6 && */ childElement.nodeName.toLowerCase() == "textarea")
                    {
                        border = measure.getMeasureBox(childElement, "border");

                        // in IE6 we need to hide the problematic element in order to get 
                        // the correct width of its parentNode
                        if (_isIE6)
                        {
                            childElement.style.display = "none";
                            boxSpace = childElement.parentNode.offsetWidth;
                            childElement.style.display = "block";
                        }
                        else
                        {
                            boxSpace = childElement.parentNode.offsetWidth;
                        }

                        // remove the border space
                        childElement.style.width = 
                                Math.max(0, boxSpace - border.left - border.right) + "px";
                    }
                }
                else
                {
                    setClass(childElement, "boxFixPos");

                    childElement.style.left = computedSpace + "px";
                    childElement.style.width = space + "px";

                    // boxObject.height IE6 only
                    if (_isIE6)
                    {
                        // TODO: figure out how to solve the problem with minimumSpace
                        childBoxObject.height = boxObject.height || parentElement.offsetHeight;
                        childElement.style.height = childBoxObject.height + "px";
                    }
                }
            }

            // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
            // update the computed space sum

            computedSpace += space;
        }

        // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
        // Ensuring minimum space

        if (parentElement != flexBox.root && 
            // we should not resize the root element, otherwise it will loose its flexible ability
            // (in case it has a relative property like height:100% for instance)
            parentElement.parentNode != flexBox.root && 
            orientation.isVertical)
        {
            // TODO: check for "deeper" parents?
            // here we are enforcing that the parent box dimension (height or width) 
            // won't be smaller than the minimum space required, which is the sum 
            // of fixed dimension child boxes
            parentElement.parentNode.style[orientation.dimension] = 
                    Math.max(parentElement.parentNode[orientation.offset], minimumSpace) + "px";
        }
    }

}

//* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

// ************************************************************************************************
// helper functions

function hasClass(node, name)
{
    return (' ' + node.className + ' ').indexOf(' ' + name + ' ') != -1;
}

function setClass(node, name)
{
    if (node && (' ' + node.className + ' ').indexOf(' ' + name + ' ') == -1)
        node.className += " " + name;
}

function addEvent(object, name, handler, useCapture)
{
    if (object.addEventListener)
        object.addEventListener(name, handler, useCapture);
    else
        object.attachEvent("on" + name, handler);
}

function removeEvent(object, name, handler, useCapture)
{
    if (object.removeEventListener)
        object.removeEventListener(name, handler, useCapture);
    else
        object.detachEvent("on" + name, handler);
}

function cancelEvent(e, preventDefault)
{
    if (!e)
        return;

    if (preventDefault)
    {
        if (e.preventDefault)
            e.preventDefault();
        else
            e.returnValue = false;
    }

    if (e.stopPropagation)
        e.stopPropagation();
    else
        e.cancelBubble = true;
}

// ************************************************************************************************
// IE6 background glitch fix
// http://www.mister-pixel.com/#Content__state=is_that_simple

var fixIE6BackgroundImageCache = function(doc)
{
    doc = doc || document;
    try
    {
        doc.execCommand("BackgroundImageCache", false, true);
    }
    catch (E)
    {
    }
};

// ************************************************************************************************

return FlexBox;

// ************************************************************************************************
});