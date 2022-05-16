
var myPlayer;
var contentDetails;
var singleContentTypes = ["MOVIES", "PLAYS", "CLIPS"];
var multiContentTypes = ["SHOWS", "SERIES"];
var videoDuration = 0;
var lastWatchTime = 0;
var adConfigId = '';
var logVideoTimeInterval;
var timer = 0;
var autoLoggingPeriod = 360;
var arePlayerEventsListenersRegistered = false;

var subtitlesConfigList = [];
var currentlySelectedSubtitleIndex = 0;

var audioTracksConfigList = [];
var currentlySelectedAudioTrackIndex = 0;

var thumbnails = [];
var thumbnailTime = 0;
var setThumbnails = false;
var currentThumbnail;
var logVideoTimeFunction;
var videoObj;

var from = 0;
var seekStart = false;

var isOverlaySet = false;


var forwardBackwardInterval = 5; // Number of seconds the progress bar will move forward or backward when clicking on right or left arrows.

var isVideoStartedFromBeginning = false;

var videoReplayThreshold = 30; // Value in seconds
var isAdEnded = false;
var isPlayerControlsDisabled = false;

var preRollAdDuration = 0;

function runPlayer(contentDetailsObj, logVideoTimeFunctionRef) {
        
        videojs('my-player').ready (function (p) {
            myPlayer = this;

            if(myPlayer.bcAnalytics && myPlayer.bcAnalytics.client) {
                myPlayer.bcAnalytics.client.setUser(localStorage.getItem('PROFILE_ID'));
            }
            // myPlayer.requestFullscreen();
            adConfigId = getVideoAdId(contentDetailsObj);

            if(adConfigId) {
                myPlayer.ssai();
            }

            setFocusableButtons(contentDetailsObj);
            getVideoFromCloud(contentDetailsObj, logVideoTimeFunctionRef);
            
        });
}


function getVideoFromCloud(contentDetailsObj, logVideoTimeFunctionRef) {
    if(myPlayer){
        reinitializePlayerState();

        contentDetails = contentDetailsObj;
        logVideoTimeFunction = logVideoTimeFunctionRef;
        
        if(adConfigId) {
            // var controlBar = document.getElementsByClassName('vjs-control-bar')[0];
            // controlBar.style.display = 'none';
            setPlayerControlBarVisibility(false);

            var actionsButtons = document.getElementById('actions-buttons-container');
            actionsButtons.style.display = 'none';

            myPlayer.one("adend", function(){
                isAdEnded = true;
                if(lastWatchTime && lastWatchTime > 0) {
                    setVideoStartTimeBasedOnLastWatchTime(lastWatchTime, videoDuration);
                }

                // controlBar.style.display = 'flex';
                setPlayerControlBarVisibility(true);
                actionsButtons.removeAttribute('style');
            });

        }

        if(contentDetails.playerToken) {
            // myPlayer.catalog.setPolicyKey(null);
            myPlayer.catalog.setBcovAuthToken(contentDetails.playerToken);
        }


        myPlayer.catalog.getVideo(getAssetId(contentDetails), function (error, video) {

            videoObj = video;

            myPlayer.catalog.load (video);
            myPlayer.poster (video.poster);
    
    
            videoDuration = myPlayer.mediainfo.duration;
    
            lastWatchTime = getLastWatchTime(contentDetails);

            if(lastWatchTime && lastWatchTime > 0) {
                if(adConfigId) {
                  myPlayer.one('durationchange', function(){
                    playVideo();
                  });
                  myPlayer.one("adend", function(){
                    isAdEnded = true;
                    seekStart = true;
                    setVideoStartTimeBasedOnLastWatchTime(lastWatchTime, videoDuration);
                  });
                } else {
                  seekStart = true;
                  setVideoStartTimeBasedOnLastWatchTime(lastWatchTime, videoDuration);
                }
            } else {
                playVideo();
            }

            if(!adConfigId) playVideo();

            var source ;
            var license;
            var widevineSystem;
            video.sources.forEach(function (src) {
                var deliveryMethod = src.type;
                var keySystems = src["key_systems"];
                if (keySystems) {
                    widevineSystem = keySystems["com.widevine.alpha"];
                }
                if (widevineSystem) {
                    license = widevineSystem["license_url"];
                }
    
                if (deliveryMethod ===  "application/dash+xml"){
                    src.mode = "disabled";
                    source = src["src"];
                }                
            });
 
            if(source) {

                var videoSrc = {
                    src: source,
                    type: 'application/dash+xml'
                }

                if(license) {
                    videoSrc.keySystems ={
                        'com.widevine.alpha': license
                    }
                }
                
                if(contentDetails.playerToken) {
                    videoSrc['emeHeader'] = {
                        'bcov-auth': contentDetails.playerToken
                    }
                }
                myPlayer.src(videoSrc);
            }
    
            if(!arePlayerEventsListenersRegistered) {
                setPlayerEventListeners(contentDetails);
                setClickEventHandlers(contentDetails);
                arePlayerEventsListenersRegistered = true;
            }

            document.getElementsByClassName('vjs-subs-caps-button')[0].setAttribute('tabindex', -1);

    
        }, adConfigId);
    }
}

function setVideoStartTimeBasedOnLastWatchTime(lastWatchTime, videoDuration) {
    if(Math.floor(videoDuration - lastWatchTime) >= videoReplayThreshold) {
        setStartTime(lastWatchTime);
    } else {
        setStartTime(1); 
    }
}

function isContentOfTypeSingle(contentDetails) {
    var index = singleContentTypes.findIndex(function (contentType){ return  contentDetails.type === contentType});
    if(index !== -1) 
        return true;
    else return false;
}

function getAssetId (contentDetails) {
    if(contentDetails.is_live_streaming) {
        return 'ref:' + contentDetails.live_streaming.embed_code;
    } else if(contentDetails.type) {
        
        if(isContentOfTypeSingle(contentDetails)) {
            return 'ref:' + contentDetails.asset_id;
        }

        // content is not single, so it will be categorized as multi content.

        var currentSeason = contentDetails.seasons.find(function (season) { return  season.id === contentDetails.season_id });
        return 'ref:' + currentSeason.default_episode.asset_id;
    }
}

function getVideoAdId(contentDetails) {
    // video_ads_id
    if(contentDetails.is_live_streaming) {
        return contentDetails.video_ads_id;
    } else if(contentDetails.type) {
        
        if(isContentOfTypeSingle(contentDetails)) {
            return contentDetails.video_ads_id;
        }

        // content is not single, so it will be categorized as multi content.

        var currentSeason = contentDetails.seasons.find(function (season) { return  season.id === contentDetails.season_id });
        return currentSeason.default_episode.video_ads_id;
    }
}

function getLastWatchTime(contentDetails) {
    if(isContentOfTypeSingle(contentDetails)) {
        return (contentDetails.end_watch_time || 0) / 1000;
    } else {
        var currentSeason = contentDetails.seasons.find(function (season) { return season.id === contentDetails.season_id });
        return (currentSeason.default_episode.end_watch_time || 0) / 1000;
    }
}

function getSkipTime(contentDetails) {
    if(isContentOfTypeSingle(contentDetails)) {
        return contentDetails.skip_time ;
    } else {
        var currentSeason = contentDetails.seasons.find(function (season) { return season.id === contentDetails.season_id });
        return currentSeason.default_episode.skip_time;
    }
}

function getNextEpisode(contentDetails) {
    if(!isContentOfTypeSingle(contentDetails)) {
        var currentSeason = contentDetails.seasons.find(function (season) { return  season.id === contentDetails.season_id });
        var currentEpisode = currentSeason ? currentSeason.default_episode : null;
        var nextEpisode = contentDetails.episodesList.find(function (episode) {
            return episode.episode_number === parseInt(currentEpisode.episode_number) + 1;
        });

        return nextEpisode;
    }
}

function setStartTime(startTimeInSeconds) {
    myPlayer.currentTime(startTimeInSeconds);
}

function playVideo() {
    myPlayer.play();
}

function pauseVideo() {
    myPlayer.pause();
}

function setPlayerEventListeners(contentDetails) {


    myPlayer.on('loadstart', function () {
        injectContentDetailsIntoPlayerOverlay(contentDetails);
        
        var nextEpisode = getNextEpisode(contentDetails);
        if(nextEpisode) {
            document.getElementById('next-episode-btn').style.display = 'flex';
        } else {
            document.getElementById('next-episode-btn').style.display = 'none';
        }


        if(contentDetails.is_live_streaming) {
            document.getElementById('start-form-beginning-btn').style.display = 'none';
        } else  {
            document.getElementById('start-form-beginning-btn').style.display = 'flex';
        }
    });

    myPlayer.on("loadedmetadata", function () {
        prepareSubtitlesListUI();
        prepareAudioTracksListUI();

        // setThumbnails = true;
        var textTracks = myPlayer.mediainfo.textTracks;
        if (textTracks && textTracks.length > 0 && document.getElementById('audio-subtitles-btn')) {
            document.getElementById('audio-subtitles-btn').style.display = 'flex';
        }

        if (!adConfigId && textTracks && textTracks.length > 0) {

            var thumbnail = textTracks.find(function (track) {
                return track.kind === "metadata" && track.label === "thumbnails";
            });

            if (thumbnail && thumbnail.src) {
                setThumbnails = true;
                setThumbnailsPlugin(thumbnail.src);
            }
        }else if(adConfigId){
            try {
                var thumbnailSrc = myPlayer.ssai().vmap.thumbnails[0].url;
                
                if(thumbnailSrc){
                    myPlayer.on('ads-ad-ended',function( evt ){
                        setThumbnails = true;
                        setThumbnailsPlugin(thumbnailSrc);
                    });
                    
                }
            }catch(e){

            }
            // the other workaround for SSAI + thumbnails if BC solution doesn't work as expected
            /*if(adConfigId && myPlayer.mediainfo && myPlayer.mediainfo.sources && myPlayer.mediainfo.sources.length > 0 && myPlayer.mediainfo.sources[0].vmap){
                var vmapSrc = myPlayer.mediainfo.sources[0].vmap;
                
                var xmlhttp = new XMLHttpRequest();
                xmlhttp.onreadystatechange = function() {
                    if (this.readyState == 4 && this.status == 200) {
                        var thumbnailUrls = this.responseXML.getElementsByTagName("bc:thumbnailURL");
                        if(thumbnailUrls.length>0 && thumbnailUrls[0].innerHTML){
                            var thumbnailSrc = thumbnailUrls[0].innerHTML;
                            setThumbnailsPlugin(thumbnailSrc);                                
                        }   
                    }
                };
                xmlhttp.open("GET", vmapSrc, true);
                xmlhttp.send();
            }*/
        }
    })

    myPlayer.on('pause', function () {
        

        try {
            var playerOverlayElement = document.getElementById('player-overlay');
            if(playerOverlayElement) {
                playerOverlayElement.style.display = 'flex';
            }
            if(document.getElementsByClassName('audio-subtitles-list')[0].style.display == 'none') {
                document.getElementsByClassName('content-details')[0].style.display = 'block';
            }
    
            // document.getElementsByClassName('audio-subtitles-list')[0].style.display = 'none';
            myPlayer.addClass('pause-active');
    
            document.getElementById('skip-buttons-container').style.display = 'none';
            document.getElementById('skip-intro-btn').style.display = 'none';
            document.getElementById('skip-outro-btn').style.display = 'none';
            
            logVideoTime ();

        } catch(e) {}

    });

    myPlayer.on ('play', function () {
        document.getElementsByClassName('content-details')[0].style.display = 'none';
        document.getElementsByClassName('audio-subtitles-list')[0].style.display = 'none';
        document.getElementById('player-overlay').style.display = 'none';

        myPlayer.removeClass('pause-active');
        
        from = myPlayer.currentTime ();
        startProgressTimer();

    });

    myPlayer.on ('seeked', function () {
        from = myPlayer.currentTime();
    });

    myPlayer.on('timeupdate', function () {

        if(isVideoStartedFromBeginning) {
            isVideoStartedFromBeginning = false;
            setPlayerControlBarVisibility(true);
            myPlayer.userActive(false);
        }

        if(!myPlayer.paused()) {
            thumbnailTime = getCurrentTime();
            // toggleImageOverlayVisibility(contentDetails, thumbnailTime);
        }

        if (seekStart == true) {
            seekStart = false;
            from = myPlayer.currentTime();
            startProgressTimer();
        }

        if(!isOverlaySet) {
            isOverlaySet = true;
            setImageOverlay(contentDetails);
        }

        
        if (setThumbnails && document.querySelector('#my-player .vjs-current-time')) {
            document.querySelector('#my-player .vjs-current-time').innerHTML = '<span class="vjs-current-time-display">' + msToHMS(thumbnailTime * 1000) + '</span>';
        }

        var skipTime = getSkipTime(contentDetails);
        var skipButtonsContainer = document.getElementById('skip-buttons-container');
        var skipIntroBtnElement = document.getElementById('skip-intro-btn');
        var skipOutroBtnElement = document.getElementById('skip-outro-btn');

        if (skipTime.end_outro_time > 0 && 
            (getCurrentTime() >= Math.floor(skipTime.end_outro_time / 1000) && 
            (getCurrentTime() <= Math.floor(skipTime.end_outro_time / 1000) + 20))){
            // nextEpisode = episodes.find(function(episode){
            //   return episode.episode_number === parseInt(episodeNumber) + 1
            // });

            var nextEpisode = getNextEpisode(contentDetails);
            if(nextEpisode && skipOutroBtnElement && skipOutroBtnElement.style.getPropertyValue('display') === 'none') {
                skipButtonsContainer.style.display = 'block';
                skipOutroBtnElement.style.display = 'block';
            }

        } else if (skipOutroBtnElement && skipOutroBtnElement.style.getPropertyValue('display') !== 'none') {
            skipButtonsContainer.style.display = 'none';    
            skipOutroBtnElement.style.display = 'none';              
        }

        if ((getCurrentTime() > (skipTime.skip_intro_start / 1000) + 20 || (getCurrentTime() < skipTime.skip_intro_start / 1000))){
            
            if(skipIntroBtnElement && skipIntroBtnElement.style.getPropertyValue('display') !== 'none') {
                skipButtonsContainer.style.display = 'none';
                skipIntroBtnElement.style.display = 'none';
            }
        } else if(skipTime.skip_intro_end > 0 && skipIntroBtnElement && skipIntroBtnElement.style.display == 'none') {
            skipButtonsContainer.style.display = 'block';
            skipIntroBtnElement.style.display = 'block';
        }

        if (timer >= autoLoggingPeriod) {
            logVideoTime();
            from = myPlayer.currentTime();
            startProgressTimer();
        }
        
    });

    myPlayer.on('ended', function () {
        goToNextEpisode(contentDetails);
    });

    myPlayer.on ('seeking', function () {
        if (!seekStart) {
            seekStart = true;
            logVideoTime ();
        }
    })

    myPlayer.on ('error', function () {
        if(myPlayer && myPlayer.error() && myPlayer.error().code == "GSC_ERR_DENIED_BY_CONCURRENCY_LIMITING") {
            var errorModal = document.getElementsByClassName('conccurent-limit-error-msg')[0];
            var errorModalTitle = document.querySelector('.conccurent-limit-error-msg #error-msg-title');
            var errorModalDescription = document.querySelector('.conccurent-limit-error-msg #error-msg-desc');
            errorModalTitle.textContent = localStorage.getItem('LANG') === 'en' ?  'Screen Limit' : 'الحد الأقصى للشاشات';
            errorModalDescription.textContent = localStorage.getItem('LANG') === 'en' ? 'You have reached the limit of screens playing at the same time. \n Stop playing on one of the screens to continue watching.' : 'لقد وصلت إلى الحد الأقصى لعدد الشاشات التي يتم تشغيلها في نفس الوقت. برجاء إيقاف المشاهدة على واحدة من الشاشات لمتابعة المشاهدة بدون توقف.';
            
            errorModal.style.display = 'flex';
        }
    });

}

function logVideoTime (callback) {
    if(adConfigId && !isAdEnded) return; // to prevent logging any video time while the AD is playing.

    window.clearInterval(logVideoTimeInterval);
    // var from = getCurrentTime();
    var to = from + timer;
    var res = null;

    if (from < to && Math.floor(to - from) > 3) {

        var contentID, contentType;

        if(isContentOfTypeSingle(contentDetails)) {
            contentID = contentDetails.id;
            contentType = contentDetails.type;
        } else {
            var currentEpisodeOfCurrentSeason = getCurrentEpisodeOfCurrentSeason(contentDetails);
            contentID = currentEpisodeOfCurrentSeason.id;
            contentType = currentEpisodeOfCurrentSeason.type;
        }

        if(logVideoTimeFunction) {
            logVideoTimeFunction({
                id: contentID,
                key: contentType,
                from: parseInt (from) * 1000,
                to: parseInt (to) * 1000
            });
        }
    } else if (typeof callback === 'function') {
      callback(res);
    }
    timer = 0;
}

function setThumbnailsPlugin(vttFileSrc) {

    var thumbnailsContainerElement = document.getElementsByClassName('thumbnails-list')[0];

    thumbnailsContainerElement.innerHTML = '';

    for(var i = 0; i < 7; i++) {
        var thumbnailImage = document.createElement("img");
        thumbnailImage.id = 'thumbnail-img-' + i;
        thumbnailImage.className = 'thumbnail-img';
        thumbnailImage.setAttribute('src','assets/images/black-placeholder.svg');
        thumbnailImage.setAttribute('onerror',"this.src='assets/images/black-placeholder.svg';");
        thumbnailsContainerElement.appendChild(thumbnailImage);
    }

    // we are using XMLHttpRequest because fetch API is not supported on chromuim version 38 which LG 2016-2018 uses.

    var xmlhttp = new XMLHttpRequest();

    xmlhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
            convertVttToJson(this.responseText).then(function(result) {
                thumbnails = result;
                forwardBackwardInterval = thumbnails && thumbnails.length > 0 ? ((thumbnails[0].end - thumbnails[0].start) / 1000) : forwardBackwardInterval;
            });
        }
    };
    xmlhttp.open("GET", vttFileSrc, true);
    xmlhttp.send();


}

function setThumbnailImage() {
    var thumbnailsNumber = 0;

    if (thumbnails && thumbnails.length > 0) {
        // var preRollAdDuration = 0;
        if(adConfigId) {
            preRollAdDuration = myPlayer.ssai().absoluteTimelineState().absoluteDuration - myPlayer.ssai().absoluteTimelineState().relativeDuration;
        }

        var currentThumbnailIndex = thumbnails.findIndex(function (thumbnail){
          thumbnailTime = (thumbnailTime < 0) ? 0 : thumbnailTime;
          var currentTime = thumbnailTime * 1000;
          return (currentTime >= (thumbnail.start - (preRollAdDuration * 1000)) && currentTime < (thumbnail.end - (preRollAdDuration * 1000)));
        });
    
        if (currentThumbnailIndex !== -1) {

          currentThumbnail = thumbnails[currentThumbnailIndex];
          pauseVideo();

          var progressWidth = (thumbnailTime / videoDuration) * 100;
          document.getElementsByClassName('vjs-play-progress')[0].style.width = progressWidth + '%';
        //   document.querySelector('#my-player #thumbnails-preview img.thumbnail-img').setAttribute('src', currentThumbnail.part);

        //   document.querySelector('#my-player #thumbnails-preview').setAttribute('style', `left:${progressWidth}%`)

            /**
             * Thumbnails previews are created with Ids [thumbnail-img-0, thumbnail-img-1, ... , thumbnail-img-6]
             * The middle preview will have the Id "thumbnail-img-3"
             */
            setThumbnailsPreviewVisibility(true);
        
            var currentTumbnailNumber = 2;
            for(var i = (currentThumbnailIndex - 1); i >= 0 ; i--) {
                    if(currentTumbnailNumber === -1) break;
                    if(!thumbnails[i].part) thumbnails[i].part = 'assets/images/black-bg.png';
                    document.getElementById('thumbnail-img-' + currentTumbnailNumber).setAttribute('src', thumbnails[i].part);
                    currentTumbnailNumber--;
            }
            document.getElementById('thumbnail-img-3').setAttribute('src', thumbnails[currentThumbnailIndex].part);
            
            currentTumbnailNumber = 4;
            for(var i = currentThumbnailIndex + 1; i < thumbnails.length ; i++) {
                if(currentTumbnailNumber === 7) break;
                if(!thumbnails[i].part) thumbnails[i].part = 'assets/images/black-bg.png';
                document.getElementById('thumbnail-img-' + currentTumbnailNumber).setAttribute('src', thumbnails[i].part);
                currentTumbnailNumber++;
            }

            // document.querySelector('#my-player .vjs-current-time-display').innerHTML = msToHMS(thumbnails[currentThumbnailIndex].start);
            var currentTime = thumbnails[currentThumbnailIndex].start - (preRollAdDuration * 1000).toFixed(0);
            document.querySelector('#my-player .vjs-current-time-display').innerHTML = msToHMS(currentTime > 0 ? currentTime : 0);
            
            return true;
    
        } else {
            currentThumbnail = null;
        }
        return false;
    } else {
        // setStartTime (thumbnailTime);

        // seeking in case there are no thumbnails
        currentThumbnail = null;
        pauseVideo();
        if(thumbnailTime >= 0 && thumbnailTime <= videoDuration) {
            var progressWidth = (thumbnailTime / videoDuration) * 100;
            document.getElementsByClassName('vjs-play-progress')[0].style.width = progressWidth + '%';
            // document.querySelector('#my-player .vjs-current-time-display').innerHTML = msToHMS(thumbnailTime * 1000);
            document.querySelector('#my-player .vjs-current-time').innerHTML = '<span class="vjs-current-time-display">' + msToHMS(thumbnailTime * 1000) + '</span>';
            return true;
        }
    }
}

function setImageOverlay(contentDetails) {
    if(!isContentOfTypeSingle(contentDetails)) {
        var currentEpisode = getCurrentEpisodeOfCurrentSeason(contentDetails);
        contentDetails.overlay = currentEpisode.overlay;
    }

    if(contentDetails.overlay) {
        var start = Math.floor(contentDetails.overlay.start / 1000) || 0;
        var duration = Math.floor(contentDetails.overlay.duration / 1000) || 0;
        var ad_interval = Math.floor(contentDetails.overlay.interval / 1000) || 0;

        var startOverlay = 0;
        var intervalCounter = 0;

        var overlays = [];


        for (var i = start; i < Math.floor(videoDuration); i += ad_interval) {
            startOverlay = (i === start) ? i : (i + (duration * intervalCounter));
      
            overlays.push({
              align: "bottom",
              class: 'ad-overlay',
              content: '<img class="image-overlay" src="' + contentDetails.overlay.content + '">',
              start: startOverlay,
              end: startOverlay + duration
            });

            intervalCounter++;
        }

        myPlayer.overlay({
            overlays: overlays
        });
    }
}

function toggleImageOverlayVisibility(contentDetails, currentPlayerTime) {
    if(contentDetails.overlay) {
        var startTime = contentDetails.overlay.start / 1000;
        var endTime = (contentDetails.overlay.start + contentDetails.overlay.duration) / 1000;

        if(currentPlayerTime >= startTime && currentPlayerTime <= endTime) {
            var imageOverlayElement = document.getElementsByClassName('image-overlay')[0];
            if(imageOverlayElement) {
                imageOverlayElement.style.display = 'block';
            }  
        } else {
            var imageOverlayElement = document.getElementsByClassName('image-overlay')[0];
            if(imageOverlayElement) {
                imageOverlayElement.style.display = 'none';
            }
        }
    }
}

function setClickEventHandlers(contentDetails) {
    var backBtnElement = document.getElementById('back-btn');
    var skipIntroBtnElement = document.getElementById('skip-intro-btn');
    var skipOutroBtnElement = document.getElementById('skip-outro-btn');
    var audioSubtitlesBtnElement = document.getElementById('audio-subtitles-btn');
    var startFromBeginningBtnElement = document.getElementById('start-form-beginning-btn');
    var goToNextEpisodeBtnElement = document.getElementById('next-episode-btn');

    backBtnElement.addEventListener('keydown', function (e) {
        if(getDirection(e.keyCode) && backBtnElement.style.display != 'none') {
            e.stopPropagation();
            e.preventDefault();
            SpatialNavigation.move(getDirection(e.keyCode));
        }
    });

    skipIntroBtnElement.addEventListener('keydown', function(e) {
        myPlayer.userActive(true);
        if(e.keyCode === 13) {
            e.stopPropagation();
            e.preventDefault();
            var skipTime = getSkipTime(contentDetails);
            myPlayer.currentTime(skipTime.skip_intro_end / 1000);
            skipIntroBtnElement.style.display = 'none';
            document.getElementById('skip-buttons-container').style.display = 'none';
        }
    });

    skipIntroBtnElement.addEventListener('click', function(e) {
            const event = new Event('keydown')
            event.keyCode = 13;
            skipIntroBtnElement.dispatchEvent(event);
    });

    skipOutroBtnElement.addEventListener('keydown', function(e) {
        myPlayer.userActive(true);
        if(e.keyCode === 13) {
            e.stopPropagation();
            e.preventDefault();
            goToNextEpisode(contentDetails);
            document.getElementById('skip-buttons-container').style.display = 'none';
        }

    });

    skipOutroBtnElement.addEventListener('click', function(e) {
        const event = new Event('keydown')
        event.keyCode = 13;
        skipOutroBtnElement.dispatchEvent(event);
    });

    audioSubtitlesBtnElement.addEventListener('click', function (e) {
        e.stopPropagation();
        e.preventDefault();
        document.getElementById('player-overlay').style.display = 'flex';
        document.getElementsByClassName('audio-subtitles-list')[0].style.display = 'block';
        document.getElementsByClassName('content-details')[0].style.display = 'none';

        pauseVideo();
    });

    audioSubtitlesBtnElement.addEventListener('keydown', function (e) {
        if(getDirection(e.keyCode) && audioSubtitlesBtnElement.style.display != 'none') {
            e.stopPropagation();
            e.preventDefault();
            SpatialNavigation.move(getDirection(e.keyCode));
        }
    });

    startFromBeginningBtnElement.addEventListener('click', function() {
        if(adConfigId) {
            setStartTime(1);
        } else {
            setStartTime(0);
        }
        isVideoStartedFromBeginning = true;
        setPlayerControlBarVisibility(false);
        myPlayer.play();
    });

    startFromBeginningBtnElement.addEventListener('keydown', function(e) {
        if(getDirection(e.keyCode) && startFromBeginningBtnElement.style.display != 'none') {
            e.stopPropagation();
            e.preventDefault();
            SpatialNavigation.move(getDirection(e.keyCode));
        }
    });

    goToNextEpisodeBtnElement.addEventListener('click', function() {
        goToNextEpisode(contentDetails);
    })

    goToNextEpisodeBtnElement.addEventListener('keydown', function(e) {
        if(getDirection(e.keyCode) && goToNextEpisodeBtnElement.style.display != 'none') {
            e.stopPropagation();
            e.preventDefault();
            SpatialNavigation.move(getDirection(e.keyCode));
        }
    })
}

function goToNextEpisode(contentDetails) {
    var nextEpisode = getNextEpisode(contentDetails);
    if(nextEpisode) {
    
        var currentSeason = getCurrentSeason(contentDetails);
        var currentSeasonIndex = contentDetails.seasons.findIndex(function (season) {
            return season.id === currentSeason.id;
        });

        if(currentSeasonIndex !== -1) {
            contentDetails.seasons[currentSeasonIndex].default_episode = nextEpisode;
            localStorage.setItem('CONTENT', JSON.stringify(contentDetails));
            getVideoFromCloud(contentDetails, logVideoTimeFunction);
        }
    }
}

function getCurrentTime() {
    return myPlayer.currentTime();
}

function startProgressTimer(){
    window.clearInterval(logVideoTimeInterval);
    timer = 0;
    logVideoTimeInterval = window.setInterval(function () {
      timer += 1;
    }, 1000);
}

function createListItemElement(text, isSelected, index) {
    if(text && text.toLowerCase().includes('ar')) {
        text = localStorage.getItem('LANG') === 'ar' ? 'عربي' : 'Arabic'
    } else if(text && text.toLowerCase().includes('en')) {
        text = localStorage.getItem('LANG') === 'ar' ? 'الإنجليزية' : 'English'
    }
    return '<button id="subtitle-choice-' + index + '" class="header-7 choice focusable text-left" onclick="selectSubtitle(' + index + ')"><span class="choice-name">' + text + '</span><span id="selection-indicator" class="' + (isSelected ? 'icon-selected' : '') + ' mx-2"></span></button>';
}

function createAudioTrackListItemUIElement(text, isSelected, index) {
    if(text && text.toLowerCase().includes('ar')) {
        text = localStorage.getItem('LANG') === 'ar' ? 'عربي' : 'Arabic'
    } else if(text && text.toLowerCase().includes('en')) {
        text = localStorage.getItem('LANG') === 'ar' ? 'الإنجليزية' : 'English'
    }
    return '<button id="audio-track-choice-' + index + '" class="header-7 choice focusable text-left" onclick="selectAudioTrack(' + index + ')"><span class="choice-name">' + text + '</span><span id="selection-indicator" class="' + (isSelected ? 'icon-selected' : '') + ' mx-2"></span></button>';
}

function selectSubtitle(index) {
    
    var subtitleConfig = subtitlesConfigList[index];
    if(subtitleConfig) {
        subtitleConfig.actualHtmlElement.dispatchEvent(new Event("click"));
        

        subtitlesConfigList[currentlySelectedSubtitleIndex].isSelected = false;
        subtitleConfig.isSelected = true;
        currentlySelectedSubtitleIndex = index;

        subtitlesConfigList.forEach(function (item) {
            var selectionIcon = document.querySelector('#' + item.virtualHtmlElementId +  ' #selection-indicator');
            if(selectionIcon) {
                if(item.isSelected) {
                    selectionIcon.classList.add('icon-selected');
                } else {
                    selectionIcon.classList.remove('icon-selected');
                }
            }
        })
    }
}

function selectAudioTrack(index) {
    
    var audioTrackConfig = audioTracksConfigList[index];
    if(audioTrackConfig) {
        audioTrackConfig.actualHtmlElement.dispatchEvent(new Event("click"));
        

        audioTracksConfigList[currentlySelectedAudioTrackIndex].isSelected = false;
        audioTrackConfig.isSelected = true;
        currentlySelectedAudioTrackIndex = index;

        audioTracksConfigList.forEach(function (item) {
            var selectionIcon = document.querySelector('#' + item.virtualHtmlElementId +  ' #selection-indicator');
            if(selectionIcon) {
                if(item.isSelected) {
                    selectionIcon.classList.add('icon-selected');
                } else {
                    selectionIcon.classList.remove('icon-selected');
                }
            }
        })
    }
}

function prepareSubtitlesListUI() {
    
    var nativeSubtitlesElementsList = document.querySelectorAll('#my-player .vjs-subs-caps-button.vjs-control  .vjs-menu .vjs-menu-item:not(.vjs-texttrack-settings)') || [];
    var newSubtitlesListUI = '';

    nativeSubtitlesElementsList.forEach(function (item, index) {
        if(item.textContent.includes('off')) {

            var text = localStorage.getItem('LANG') === 'ar' ? 'بدون ترجمة' : 'No Subtitles';
            newSubtitlesListUI += createListItemElement(text, item.classList.contains('vjs-selected'), index);
            subtitlesConfigList.push({
                isSelected: item.classList.contains('vjs-selected'),
                actualHtmlElement: item,
                virtualHtmlElementId: 'subtitle-choice-' + index
            });

            currentlySelectedSubtitleIndex = item.classList.contains('vjs-selected') ? (subtitlesConfigList.length - 1) : currentlySelectedSubtitleIndex;
        } else  {
            newSubtitlesListUI += createListItemElement(item.textContent.split(',')[0], item.classList.contains('vjs-selected'), index)
            subtitlesConfigList.push({
                isSelected: item.classList.contains('vjs-selected'),
                actualHtmlElement: item,
                virtualHtmlElementId: 'subtitle-choice-' + index
            });

            currentlySelectedSubtitleIndex = item.classList.contains('vjs-selected') ? (subtitlesConfigList.length - 1) : currentlySelectedSubtitleIndex;
        }
    });

    if(document.getElementById('subtitles-list')) {
        document.getElementById('subtitles-list').innerHTML = '';
        document.getElementById('subtitles-list').innerHTML += newSubtitlesListUI;
    }
}

function prepareAudioTracksListUI() {
    var nativeAudioTracksElementsList = document.querySelectorAll('#my-player .vjs-audio-button.vjs-control  .vjs-menu .vjs-menu-item') || [];
    var newAudioTracksListUI = '';

    nativeAudioTracksElementsList.forEach(function(item, index) {

        newAudioTracksListUI += createAudioTrackListItemUIElement(item.textContent.split(',')[0], item.classList.contains('vjs-selected'), index);
        audioTracksConfigList.push({
            isSelected: item.classList.contains('vjs-selected'),
            actualHtmlElement: item,
            virtualHtmlElementId: 'audio-track-choice-' + index
        });

        currentlySelectedAudioTrackIndex = item.classList.contains('vjs-selected') ? (audioTracksConfigList.length - 1) : currentlySelectedAudioTrackIndex;
    });

    if(document.getElementById('audio-list')) {
        document.getElementById('audio-list').innerHTML = '';
        document.getElementById('audio-list').innerHTML += newAudioTracksListUI;
    }

}

function injectContentDetailsIntoPlayerOverlay(contentDetails) {
    /* First inject content logo image into DOM */

    document.getElementById('content-img').src = getContentLogo(contentDetails);

    /** Inject content current season name and episode name into DOM */

    var currentSeason = getCurrentSeason(contentDetails);
    var currentEpisode = getCurrentEpisodeOfCurrentSeason(contentDetails);

    if(currentSeason && currentEpisode) {
        document.getElementById('season-name').textContent = currentSeason.name;
        document.getElementById('episode-name').textContent = currentEpisode.name;
    }


    /** Inject content description into DOM */

    document.getElementById('content-description').textContent = contentDetails.description;
}

function getContentName(contentDetails) {
    return contentDetails.name;
}

function getContentDescription(contentDetails) {
    return contentDetails.description;
}

function getContentLogo(contentDetails) {
    if(contentDetails.content_images) {
        return contentDetails.content_images.LOGO.LG;
    }
}

function getCurrentSeason(contentDetails) {
    if(!isContentOfTypeSingle(contentDetails)) {
        return contentDetails.seasons.find(function (season) { return season.id === contentDetails.season_id } );
    }
}

function getCurrentEpisodeOfCurrentSeason(contentDetails) {
    if(!isContentOfTypeSingle(contentDetails)) {
        var currentSeason = contentDetails.seasons.find(function (season) { return season.id === contentDetails.season_id });
        return currentSeason.default_episode;
    }
}

function setFocusableButtons(contentDetails) {
    var playBtn = document.getElementsByClassName('vjs-play-control')[0];
    

    if(playBtn) {
        playBtn.classList.add('focusable');
        playBtn.setAttribute('tabindex', '-1');

        playBtn.addEventListener('keydown', function (e) {
            if(!e.repeat) {
                if(getDirection(e.keyCode) === 'right' || getDirection(e.keyCode) === 'left') {
                    handleWindowKeyDown(e);
                } else if(getDirection(e.keyCode)) {
                    SpatialNavigation.move(getDirection(e.keyCode))
                } else if (e.keyCode == 10009 || e.keyCode == 8 || e.keyCode == 461) {
                    window.history.back();
                } else {
                    handleWindowKeyDown(e);
                }
            }
        });
    }

    var progressBar = document.getElementsByClassName('vjs-progress-control')[0];
         
    if(progressBar && !contentDetails.is_live_streaming) {
        progressBar.classList.add('focusable');
        progressBar.setAttribute('tabindex', '-1');
        progressBar.children[0].setAttribute('tabindex', '-1');

        progressBar.addEventListener('keydown', function (e) {

            if(getDirection(e.keyCode) === 'right'){
                seekForward(e);              
            } else if (getDirection(e.keyCode) === 'left') {
                seekBackward(e);
            } else if (getDirection(e.keyCode) === 'up') {
                
                e.preventDefault();
                e.stopPropagation();
                // if(document.querySelector('#skip-intro-btn').style.display != 'none') {
                //     SpatialNavigation.focus('#skip-intro-btn');
                // } else if (document.querySelector('#skip-outro-btn').style.display != 'none') {
                //     SpatialNavigation.focus('#skip-outro-btn');
                // } else {
                // }
                SpatialNavigation.move(getDirection(e.keyCode))
            } else {
                setThumbnailsPreviewVisibility(false);

                if(e.keyCode == 13) {
                    e.stopPropagation();
                    if(myPlayer.paused()) {
                        myPlayer.userActive (true);
                        if(thumbnailTime.toFixed(0) - videoDuration.toFixed(0) === 0) {
                            thumbnailTime -= 1;
                        }
                        thumbnailTime = +thumbnailTime.toFixed(0);
                        
                        if(currentThumbnail) {
                            var time = (currentThumbnail.start / 1000) - preRollAdDuration;
                            setStartTime((currentThumbnail.start / 1000) - preRollAdDuration);
                        } else {
                            setStartTime(thumbnailTime);
                        }
                        playVideo();
                    } else {
                        pauseVideo();
                    }
                }
            }
        });

        progressBar.addEventListener('blur', function () {
            setThumbnailsPreviewVisibility(false);
        })
    }


    document.querySelector('.vjs-menu .vjs-menu-content .vjs-menu-item').addEventListener('keydown', function (e) {
        if(getDirection(e.keyCode)) {
            SpatialNavigation.move(getDirection(e.keyCode))
        }
    });

    document.addEventListener ('keydown', handleWindowKeyDown)
    document.addEventListener('cursorStateChange', handleCursorVisibilityChange);
}

function setThumbnailsPreviewVisibility(isVisible) {
    var thumbnailsContainerElement = document.querySelector('.thumbnails-list');
    if(isVisible && thumbnailsContainerElement) {
        thumbnailsContainerElement.style.display = 'flex';
    } else if(thumbnailsContainerElement) {
        thumbnailsContainerElement.style.display = 'none';
    }
}

function setPlayerControlBarVisibility(isVisible) {
    var controlBar = document.getElementsByClassName('vjs-control-bar')[0];
    controlBar.style.display = isVisible ? 'flex' : 'none';
}

function handleCursorVisibilityChange(event) {
    var visibility = event.detail.visibility;
    if(visibility){
        myPlayer.userActive(true);
    }
    else{
        myPlayer.userActive(false);
    }
}

function handleWindowKeyDown(event) {
    switch (event.keyCode) {
        case 415: // PLAY FROM REMOTE CONTROL
            playVideo();
            break;
        case 19: // PAUSE FROM REMOTE CONTROL
            pauseVideo();
            break;
        case 13: //OK button
            if(!event.repeat && !event.target.classList.contains('focusable')) {
                myPlayer.userActive(true);
                SpatialNavigation.focus('player');
            }
            break;
        case 37:
            SpatialNavigation.focus('.vjs-progress-control');
            seekBackward(event);
            break;
        case 39:
            SpatialNavigation.focus('.vjs-progress-control');
            seekForward(event);
            break;
        case 10009:
        case 8:
        case 461:
            logVideoTime();
    }
}


function seekForward(e) {
    e.preventDefault();
    e.stopPropagation();
    if(adConfigId && !isAdEnded) return; // to prevent seeking while the AD is playing.

    if(thumbnailTime + forwardBackwardInterval <= videoDuration) {
        thumbnailTime = thumbnailTime + forwardBackwardInterval;
        console.log('thumbnailTime : ', thumbnailTime)
        setThumbnailImage();
    } else if (videoDuration - thumbnailTime > 0){
        // debugger;
        thumbnailTime += (videoDuration - thumbnailTime);
        setThumbnailImage();
    }
}

function seekBackward(e) {
    e.preventDefault();
    e.stopPropagation();
    
    if(adConfigId && !isAdEnded) return; // to prevent seeking while the AD is playing.

    if(thumbnailTime - forwardBackwardInterval >= 0) {
        thumbnailTime = thumbnailTime - forwardBackwardInterval;
        setThumbnailImage();
    }
}

function msToHMS( ms ) {
    var seconds = ms / 1000;
    var hours = parseInt( seconds / 3600 );
    seconds = seconds % 3600;
    var minutes = parseInt( seconds / 60 );
    seconds = parseInt(seconds % 60);
    var time = '';
    if (hours > 0) time = hours + ":";
    if (minutes.toString().length <= 1) minutes = '0' + minutes;
    if (seconds.toString().length <= 1) seconds = '0' + seconds;
    time += minutes + ":" + seconds;
    return time;
}

function getDirection(dir) {
    switch(dir) {
      case 37:
        return 'left';
      case 39:
        return 'right';
      case 38:
        return 'up';
      case 40:
        return 'down';
      default:
        return ''
    }
}

function reinitializePlayerState() {
    subtitlesConfigList = [];
    currentlySelectedSubtitleIndex = 0;
    audioTracksConfigList = [];
    currentlySelectedAudioTrackIndex = 0;
    thumbnails = [];
    thumbnailTime = 0;
    setThumbnails = false;
    isOverlaySet = false;
    logVideoTimeFunction = null;
    seekStart = false;
    isAdEnded = false;
    currentThumbnail = null;
    preRollAdDuration = 0;
    from = 0;
}

function disposePlayer() {
    logVideoTime();
    myPlayer.dispose();
    arePlayerEventsListenersRegistered = false;
    document.removeEventListener('keydown', handleWindowKeyDown);
    reinitializePlayerState();
}
