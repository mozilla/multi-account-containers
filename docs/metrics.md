# METRICS

## Data Analysis
The collected data will primarily be used to answer the following questions.
Images are used for visualization and are not composed of actual data.

### Do users install and run this?

What is the overall engagement of the Containers experiment?
**This is the standard Daily Active User (DAU) and Monthly Active User (MAU) analysis.**

This captures data from the users who have the add-on installed, regardless of
whether they are actively interacting with it.

![](images/kpi-1.png)

### Immediate Questions

* Do people use the containers feature?
  * Click to create new container tab
* Do people who use the containers feature continue to use it?
  * Retention: opening a second container tab (second tab in the same container, or a tab in a second container?)
* What containers do people use?
  * Container name (should we record the names of custom container created by users?)
    * \+ Number of tabs in the container (when should we measure this? on every tab open?)
* Do people edit their containers? (do we care about editing built-in containers vs. user-created containers?)
  * Click on "Edit Containers"
  * Click to edit a single container
    * Click "OK"
  * Click to delete a single container
    * Click "OK"
  * Click to add a container
    * Click "OK"
* How do people create new container tabs?
  * Click to create new container tab
    * \+ `entry-point` value: "tab-bar" or "pop-up"
* Do people sort the tabs?
  * Click sort
    * \+ Number of tabs when clicked
  * average number of container types displayed on sort (what does this mean?)
* Do users hide container tabs?
  * Click hide
    * \+ Number of tabs when clicked
    * \+ `hiddenTimestamp`
  * Click show
    * \+ Number of tabs when clicked
    * \+ `shownTimestamp`
* How many containers do users have hidden at the same time? (when should we measure this? each time a container is hidden?)
* Do users move container tabs to new windows?
  * Click move
    * \+ Number of tabs when clicked
* Do users pin container tabs? (do we have existing Telemetry for pinning?)
* Do users change URLs in a container tab? (sounds like it could be a flood unless we only record the first URL change?)
* For how long do users hide container tabs?

### Follow-up Questions

What are some follow-up questions we anticipate we will ask based on any of the
above answers/data?

## Data Collection

### Server Side
There is currently no server side component to Containers.

### Client Side
Containers will use Test Pilot Telemetrywith no batching of data.  Details
of when pings are sent are below, along with examples of the `payload` portion
of a `testpilottest` telemetry ping for each scenario.

* The user clicks on a container name to open a tab in that container

```js
  {
    "container": <container-name>,
    "clicked-container-tab-count": <number-of-tabs-in-the-container>,
    "event": "container-tab-opened",
    "eventSource": ["tab-bar"|"pop-up"]
  }
```

* The user clicks "Edit Containers" in the pop-up

```js
  {
    "event": "container-edit-containers"
  }
```

* The user clicks OK after clicking on a container edit icon in the pop-up

```js
  {
    "container": <container-name>,
    "event": "container-edit-container"
  }
```

* The user clicks OK after clicking on a container delete icon in the pop-up

```js
  {
    "container": <container-name>,
    "event": "container-delete-container"
  }
```

* The user clicks OK after clicking to add a container in the pop-up

```js
  {
    "container": <container-name>,
    "event": "container-add-container"
  }
```

* The user clicks the sort button/icon in the pop-up

```js
  {
    "event": "container-sort-tabs",
    "total-container-tabs-count": <number-of-all-container-tabs>
  }
```

* The user clicks "Hide these container tabs" in the popup

```js
  {
    "clicked-container-tab-count": <number-of-tabs-in-the-container>,
    "event": "container-hide-tabs",
    "hidden-containers-count": <number-of-containers-with-tabs-hidden>
  }
```

* The user clicks "Show these container tabs" in the popup

```js
  {
    "clicked-container-tab-count": <number-of-tabs-in-the-container>,
    "event": "container-show-tabs"
  }
```

* The user clicks "Move tabs to a new window" in the popup

```js
  {
    "clicked-container-tab-count": <number-of-tabs-in-the-container>,
    "event": "container-move-tabs-to-window"
  }
```

### A Redshift schema for the payload:

```lua
local schema = {
--   column name                    field type   length  attributes   field name
    {"clickedContainerTabCount",    "INTEGER",   255,    nil,         "Fields[payload.clickedContainerTabCount]"},
    {"container",                   "VARCHAR",   255,    nil,         "Fields[payload.container]"},
    {"eventSource",                 "VARCHAR",   255,    nil,         "Fields[payload.eventSource]"},
    {"event",                       "VARCHAR",   255,    nil,         "Fields[payload.event]"},
    {"hiddenContainersCount",       "INTEGER",   255,    nil,         "Fields[payload.hiddenContainersCount]"},
    {"totalContainerTabsCount",     "INTEGER",   255,    nil,         "Fields[payload.totalContainerTabsCount]"},
}
```

### Valid data should be enforced on the server side:

* The `breakage` field MUST be either an empty string or one of "layout",
  "images", "video", "buttons", "other"

All Mozilla data is kept by default for 180 days and in accordance with our
privacy policies.
